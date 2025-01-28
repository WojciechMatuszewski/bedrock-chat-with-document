import genai from "@cdklabs/generative-ai-cdk-constructs";
import { ChunkingStrategy } from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock/index.js";
import {
  App,
  Aspects,
  CfnResource,
  Duration,
  type IAspect,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_apigatewayv2,
  aws_dynamodb,
  aws_events,
  aws_events_targets,
  aws_lambda,
  aws_lambda_nodejs,
  aws_s3,
  aws_secretsmanager,
  aws_stepfunctions,
  aws_stepfunctions_tasks,
} from "aws-cdk-lib";
import { CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import { JsonPath } from "aws-cdk-lib/aws-stepfunctions";
import { DynamoAttributeValue } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct, type IConstruct } from "constructs";
import { fileURLToPath } from "url";

class AppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const documentsBucket = new DocumentsBucket(this);
    const documentUploadedRule = new DocumentUploadedRule(this, {
      documentsBucketName: documentsBucket.bucketName,
    });

    const knowledgeBase = new BedrockKnowledgeBase(this);
    const dataSource = new BedrockDataSource(this, {
      bucket: documentsBucket,
      knowledgeBase,
    });

    const getUploadUrlFunction = new LambdaFunction(this, "GetUploadUrl", {
      entry: fileURLToPath(
        import.meta.resolve("./functions/get-upload-url/handler.ts"),
      ),
      environment: {
        BUCKET_NAME: documentsBucket.bucketName,
      },
      timeout: Duration.seconds(15),
    });
    documentsBucket.grantPut(getUploadUrlFunction);

    const api = new API(this, { getUploadUrlFunction });

    const documentsTable = new DocumentsTable(this);

    const ingestionStateMachine = new IngestionStateMachine(this, {
      documentsBucket,
      documentsTable,
    });
    documentUploadedRule.addTarget(
      new aws_events_targets.SfnStateMachine(ingestionStateMachine, {
        retryAttempts: 0,
        input: aws_events.RuleTargetInput.fromObject({
          bucketName: aws_events.EventField.fromPath("$.detail.bucket.name"),
          key: aws_events.EventField.fromPath("$.detail.object.key"),
        }),
      }),
    );
  }
}

class DocumentsBucket extends aws_s3.Bucket {
  constructor(scope: Construct) {
    super(scope, "DocumentsBucket", {
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      eventBridgeEnabled: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}

class DocumentUploadedRule extends aws_events.Rule {
  constructor(
    scope: Construct,
    { documentsBucketName }: { documentsBucketName: string },
  ) {
    super(scope, "DocumentUploadedRule", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: {
            name: [documentsBucketName],
          },
          object: {
            key: [{ suffix: "data.txt" }],
          },
        },
      },
    });
  }
}

class BedrockKnowledgeBase extends genai.bedrock.KnowledgeBase {
  constructor(scope: Construct) {
    /**
     * CFN checks validity of the data.
     *
     * The format has to be {apiKey: VALUE}.
     * The value must be a legit API Key.
     */
    const pineconeApiKey = aws_secretsmanager.Secret.fromSecretCompleteArn(
      scope,
      "PineconeApiKey",
      process.env["PINECONE_API_KEY_SECRET_ARN"]!,
    );

    const embeddingsModel =
      genai.bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024;

    const vectorStore = new genai.pinecone.PineconeVectorStore({
      /**
       * The CFN checks if the format of this parameter resembles an HTTPs address.
       */
      connectionString: process.env["PINECONE_ENDPOINT_URL"]!,
      credentialsSecretArn: pineconeApiKey.secretArn,
      textField: "text",
      metadataField: "metadata",
    });

    super(scope, "BedrockKnowledgeBase", {
      embeddingsModel: embeddingsModel,
      vectorStore,
    });
  }
}

class BedrockDataSource extends genai.bedrock.S3DataSource {
  constructor(
    scope: Construct,
    {
      bucket,
      knowledgeBase,
    }: { bucket: IBucket; knowledgeBase: genai.bedrock.KnowledgeBase },
  ) {
    super(scope, "BedrockDataStore", {
      bucket,
      dataSourceName: "documents",
      knowledgeBase,
      chunkingStrategy: ChunkingStrategy.HIERARCHICAL_TITAN,
    });
  }
}

class API extends aws_apigatewayv2.HttpApi {
  constructor(
    scope: Construct,
    { getUploadUrlFunction }: { getUploadUrlFunction: LambdaFunction },
  ) {
    super(scope, "BedrockChatWithDocumentAPI", {
      corsPreflight: {
        allowCredentials: false,
        allowHeaders: ["*"],
        allowMethods: [CorsHttpMethod.ANY],
        allowOrigins: ["*"],
        exposeHeaders: ["Access-Control-Allow-Origin"],
      },
      createDefaultStage: true,
    });

    this.addRoutes({
      path: "/upload-url",
      methods: [aws_apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "GetUploadUrlIntegration",
        getUploadUrlFunction,
      ),
    });
  }
}

export class IngestionStateMachine extends aws_stepfunctions.StateMachine {
  constructor(
    scope: Construct,
    {
      documentsBucket,
      documentsTable,
    }: {
      documentsBucket: aws_s3.Bucket;
      documentsTable: aws_dynamodb.ITableV2;
    },
  ) {
    const getDocumentMetadata = new aws_stepfunctions_tasks.CallAwsService(
      scope,
      "GetDocumentMetadata",
      {
        service: "s3",
        action: "headObject",
        parameters: {
          Bucket: aws_stepfunctions.JsonPath.stringAt("$.bucketName"),
          Key: aws_stepfunctions.JsonPath.stringAt("$.key"),
        },
        iamResources: [documentsBucket.arnForObjects("*")],
        iamAction: "s3:GetObject",
        resultSelector: {
          bucketName: aws_stepfunctions.JsonPath.stringAt(
            "$$.Execution.Input.bucketName",
          ),
          key: aws_stepfunctions.JsonPath.stringAt("$$.Execution.Input.key"),
          name: aws_stepfunctions.JsonPath.stringAt("$.Metadata.name"),
          id: aws_stepfunctions.JsonPath.stringAt("$.Metadata.id"),
        },
        resultPath: "$",
      },
    );

    const uploadMetadataFile = new aws_stepfunctions_tasks.CallAwsService(
      scope,
      "UploadMetadataFile",
      {
        service: "s3",
        action: "putObject",
        parameters: {
          Bucket: JsonPath.stringAt("$.bucketName"),
          Key: JsonPath.format("{}/metadata.json", JsonPath.stringAt("$.id")),
          Body: JsonPath.stringToJson(
            JsonPath.format(
              '\\{"name":"{}","id":"{}" \\}',
              JsonPath.stringAt("$.name"),
              JsonPath.stringAt("$.id"),
            ),
          ),
          ContentType: "application/json",
        },
        iamResources: [documentsBucket.arnForObjects("*")],
        iamAction: "s3:PutObject",
        resultPath: JsonPath.DISCARD,
      },
    );

    const saveDocumentInTable = new aws_stepfunctions_tasks.DynamoPutItem(
      scope,
      "SaveDocumentInTable",
      {
        table: documentsTable,
        item: {
          id: DynamoAttributeValue.fromString(JsonPath.stringAt("$.id")),
          name: DynamoAttributeValue.fromString(JsonPath.stringAt("$.name")),
          status: DynamoAttributeValue.fromString("PENDING"),
        },
        resultPath: JsonPath.DISCARD,
      },
    );

    // TODO: Bedrock start ingestion job with Event Bridge and "Wait for callback" pattern

    const prepareDocumentForIngestion = new aws_stepfunctions.Parallel(
      scope,
      "PrepareDocumentForIngestion",
      { resultPath: JsonPath.DISCARD },
    );
    prepareDocumentForIngestion.branch(uploadMetadataFile);
    prepareDocumentForIngestion.branch(saveDocumentInTable);

    super(scope, "IngestionStateMachine", {
      stateMachineType: aws_stepfunctions.StateMachineType.STANDARD,
      definitionBody: aws_stepfunctions.DefinitionBody.fromChainable(
        getDocumentMetadata.next(prepareDocumentForIngestion),
      ),
    });
  }
}

class LambdaFunction extends aws_lambda_nodejs.NodejsFunction {
  constructor(
    scope: Construct,
    id: string,
    props: Omit<
      aws_lambda_nodejs.NodejsFunctionProps,
      "handler" | "runtime" | "architecture"
    >,
  ) {
    super(scope, id, {
      ...props,
      handler: "handler",
      runtime: aws_lambda.Runtime.NODEJS_22_X,
      architecture: aws_lambda.Architecture.ARM_64,
    });
  }
}

class RemovalPolicyAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
  }
}

class DocumentsTable extends aws_dynamodb.TableV2 {
  constructor(scope: Construct) {
    super(scope, "DocumentsTable", {
      partitionKey: {
        name: "id",
        type: aws_dynamodb.AttributeType.STRING,
      },
      billing: aws_dynamodb.Billing.onDemand(),
      dynamoStream: aws_dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });
  }
}

const stack = new AppStack(new App(), "BedrockChatWithDocumentStack");
Aspects.of(stack).add(new RemovalPolicyAspect());
