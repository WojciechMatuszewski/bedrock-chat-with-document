import * as aws_pipes from "@aws-cdk/aws-pipes-alpha";
import * as aws_pipes_sources from "@aws-cdk/aws-pipes-sources-alpha";
import * as aws_pipes_targets from "@aws-cdk/aws-pipes-targets-alpha";
import genai from "@cdklabs/generative-ai-cdk-constructs";
import {
  ChunkingStrategy,
  type DataSource,
  type IKnowledgeBase,
} from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock/index.js";
import {
  App,
  Aspects,
  CfnResource,
  Duration,
  type IAspect,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps,
  aws_apigatewayv2,
  aws_appsync,
  aws_dynamodb,
  aws_events,
  aws_events_targets,
  aws_iam,
  aws_lambda,
  aws_lambda_nodejs,
  aws_logs,
  aws_s3,
  aws_secretsmanager,
  aws_stepfunctions,
  aws_stepfunctions_tasks,
} from "aws-cdk-lib";
import { CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { ITableV2 } from "aws-cdk-lib/aws-dynamodb";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import {
  type IStateMachine,
  JsonPath,
  TaskInput,
} from "aws-cdk-lib/aws-stepfunctions";
import { DynamoAttributeValue } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct, type IConstruct } from "constructs";
import { fileURLToPath } from "url";
import { getEnv } from "./env.ts";

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

    const documentsAPI = new DocumentsAPI(this, { getUploadUrlFunction });
    const documentsEventsAPI = new DocumentsEventsAPI(this);

    const documentsTable = new DocumentsTable(this);

    const documentsStatusPipe = new DocumentsStatusPipe(this, {
      documentsTable,
      documentsEventsAPI,
    });

    const ingestionStateMachine = new IngestionStateMachine(this, {
      knowledgeBase,
      dataSource,
    });

    const documentsStateMachine = new DocumentsStateMachine(this, {
      documentsBucket,
      documentsTable,
      ingestionStateMachine,
    });
    documentUploadedRule.addTarget(
      new aws_events_targets.SfnStateMachine(documentsStateMachine, {
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
            key: [{ suffix: "data" }],
          },
        },
      },
    });
  }
}

class BedrockKnowledgeBase extends genai.bedrock.VectorKnowledgeBase {
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
      getEnv().PINECONE_API_KEY_SECRET_ARN,
    );

    const embeddingsModel =
      genai.bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024;

    const vectorStore = new genai.pinecone.PineconeVectorStore({
      /**
       * The CFN checks if the format of this parameter resembles an HTTPs address.
       */
      connectionString: getEnv().PINECONE_ENDPOINT_URL,
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
    }: { bucket: IBucket; knowledgeBase: IKnowledgeBase },
  ) {
    super(scope, "BedrockDataStore", {
      bucket,
      dataSourceName: "documents",
      knowledgeBase,
      chunkingStrategy: ChunkingStrategy.HIERARCHICAL_TITAN,
    });
  }
}

class DocumentsAPI extends aws_apigatewayv2.HttpApi {
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

export class DocumentsStateMachine extends aws_stepfunctions.StateMachine {
  constructor(
    scope: Construct,
    {
      documentsBucket,
      documentsTable,
      ingestionStateMachine,
    }: {
      documentsBucket: aws_s3.Bucket;
      documentsTable: aws_dynamodb.ITableV2;
      ingestionStateMachine: IStateMachine;
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
          fileKey: aws_stepfunctions.JsonPath.stringAt(
            "$$.Execution.Input.key",
          ),
          fileId: aws_stepfunctions.JsonPath.stringAt("$.Metadata.id"),
          originalFileName: aws_stepfunctions.JsonPath.stringAt(
            "$.Metadata.original_file_name",
          ),
          fileName: aws_stepfunctions.JsonPath.stringAt("$.Metadata.file_name"),
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
          Key: JsonPath.format(
            "{}.metadata.json",
            JsonPath.stringAt("$.fileKey"),
          ),
          Body: JsonPath.stringToJson(
            JsonPath.format(
              `\\{ "metadataAttributes": \\{"originalFileName":"{}","fileId":"{}" \\} \\}`,
              JsonPath.stringAt("$.originalFileName"),
              JsonPath.stringAt("$.fileId"),
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
          id: DynamoAttributeValue.fromString(JsonPath.stringAt("$.fileId")),
          originalFileName: DynamoAttributeValue.fromString(
            JsonPath.stringAt("$.originalFileName"),
          ),
          fileName: DynamoAttributeValue.fromString(
            JsonPath.stringAt("$.fileName"),
          ),
          status: DynamoAttributeValue.fromString("PENDING"),
        },
        resultPath: JsonPath.DISCARD,
      },
    );

    const prepareDocumentForIngestion = new aws_stepfunctions.Parallel(
      scope,
      "PrepareDocumentForIngestion",
      { resultPath: JsonPath.DISCARD },
    );
    prepareDocumentForIngestion.branch(uploadMetadataFile);
    prepareDocumentForIngestion.branch(saveDocumentInTable);

    const invokeIngestionStateMachine =
      new aws_stepfunctions_tasks.StepFunctionsStartExecution(
        scope,
        "InvokeIngestionStateMachine",
        {
          stateMachine: ingestionStateMachine,
          integrationPattern: aws_stepfunctions.IntegrationPattern.RUN_JOB,
          input: TaskInput.fromObject({
            documentS3Uri: JsonPath.format(
              "s3://{}/{}",
              JsonPath.stringAt("$.bucketName"),
              JsonPath.stringAt("$.fileKey"),
            ),
            metadataS3Uri: JsonPath.format(
              "s3://{}/{}.metadata.json",
              JsonPath.stringAt("$.bucketName"),
              JsonPath.stringAt("$.fileKey"),
            ),
          }),
          associateWithParent: true,
          resultPath: JsonPath.DISCARD,
        },
      );

    const updateDocumentInTableIngestionSuccess =
      new aws_stepfunctions_tasks.DynamoUpdateItem(
        scope,
        "UpdateDocumentInTableIngestionSuccess",
        {
          key: {
            id: DynamoAttributeValue.fromString(JsonPath.stringAt("$.fileId")),
          },
          table: documentsTable,
          conditionExpression: "attribute_exists(#id)",
          updateExpression: "SET #status = :status",
          resultPath: JsonPath.DISCARD,
          expressionAttributeNames: {
            "#status": "status",
            "#id": "id",
          },
          expressionAttributeValues: {
            ":status": DynamoAttributeValue.fromString("READY"),
          },
        },
      );

    const updateDocumentInTableIngestionFailure =
      new aws_stepfunctions_tasks.DynamoUpdateItem(
        scope,
        "UpdateDocumentInTableIngestionFailure",
        {
          key: {
            id: DynamoAttributeValue.fromString(JsonPath.stringAt("$.fileId")),
          },
          table: documentsTable,
          conditionExpression: "attribute_exists(#id)",
          updateExpression: "SET #status = :status",
          resultPath: JsonPath.DISCARD,
          expressionAttributeNames: {
            "#status": "status",
            "#id": "id",
          },
          expressionAttributeValues: {
            ":status": DynamoAttributeValue.fromString("FAILED"),
          },
        },
      );

    super(scope, "DocumentsStateMachine", {
      stateMachineType: aws_stepfunctions.StateMachineType.STANDARD,
      definitionBody: aws_stepfunctions.DefinitionBody.fromChainable(
        getDocumentMetadata
          .next(prepareDocumentForIngestion)
          .next(
            invokeIngestionStateMachine.addCatch(
              updateDocumentInTableIngestionFailure,
              { resultPath: JsonPath.DISCARD },
            ),
          )
          .next(updateDocumentInTableIngestionSuccess),
      ),
    });
  }
}

export class IngestionStateMachine extends aws_stepfunctions.StateMachine {
  constructor(
    scope: Construct,
    {
      dataSource,
      knowledgeBase,
    }: { dataSource: DataSource; knowledgeBase: IKnowledgeBase },
  ) {
    const ingestDocument = new aws_stepfunctions_tasks.CallAwsService(
      scope,
      "IngestDocument",
      {
        service: "bedrockAgent",
        action: "ingestKnowledgeBaseDocuments",
        parameters: {
          DataSourceId: dataSource.dataSourceId,
          KnowledgeBaseId: knowledgeBase.knowledgeBaseId,
          Documents: [
            {
              Content: {
                DataSourceType: "S3",
                S3: {
                  S3Location: {
                    Uri: JsonPath.stringAt("$$.Execution.Input.documentS3Uri"),
                  },
                },
              },
              Metadata: {
                S3Location: {
                  BucketOwnerAccountId: Stack.of(scope).account,
                  Uri: JsonPath.stringAt("$$.Execution.Input.metadataS3Uri"),
                },
                Type: "S3_LOCATION",
              },
            },
          ],
        },
        iamResources: [knowledgeBase.knowledgeBaseArn],
        iamAction: "bedrock:StartIngestionJob",
        additionalIamStatements: [
          new aws_iam.PolicyStatement({
            actions: [
              "bedrock:IngestKnowledgeBaseDocuments",
              "bedrock:AssociateThirdPartyKnowledgeBase",
            ],
            resources: [knowledgeBase.knowledgeBaseArn],
            effect: aws_iam.Effect.ALLOW,
          }),
        ],
        resultPath: JsonPath.DISCARD,
      },
    );

    const waitBeforeCheckingIngestionState = new aws_stepfunctions.Wait(
      scope,
      "WaitBeforeCheckingIngestionState",
      {
        time: aws_stepfunctions.WaitTime.duration(Duration.seconds(5)),
      },
    );

    const checkIngestionState = new aws_stepfunctions_tasks.CallAwsService(
      scope,
      "CheckIngestionState",
      {
        service: "bedrockAgent",
        action: "getKnowledgeBaseDocuments",
        parameters: {
          KnowledgeBaseId: knowledgeBase.knowledgeBaseId,
          DataSourceId: dataSource.dataSourceId,
          DocumentIdentifiers: [
            {
              DataSourceType: "S3",
              S3: {
                Uri: JsonPath.stringAt("$$.Execution.Input.documentS3Uri"),
              },
            },
          ],
        },
        iamResources: [knowledgeBase.knowledgeBaseArn],
        additionalIamStatements: [
          new aws_iam.PolicyStatement({
            actions: ["bedrock:GetKnowledgeBaseDocuments"],
            resources: [knowledgeBase.knowledgeBaseArn],
            effect: aws_iam.Effect.ALLOW,
          }),
        ],
        resultSelector: {
          status: JsonPath.stringAt("$.DocumentDetails[0].Status"),
        },
      },
    );

    const waitAndCheckIngestionStatus =
      waitBeforeCheckingIngestionState.next(checkIngestionState);

    const decideOnIngestionState = new aws_stepfunctions.Choice(
      scope,
      "DecideOnIngestionState",
      {},
    );

    const documentIndexed = new aws_stepfunctions.Pass(
      scope,
      "DocumentIndexed",
    );
    decideOnIngestionState.when(
      aws_stepfunctions.Condition.stringEquals("$.status", "INDEXED"),
      documentIndexed,
    );
    decideOnIngestionState.otherwise(waitAndCheckIngestionStatus);

    super(scope, "IngestionStateMachine", {
      stateMachineType: aws_stepfunctions.StateMachineType.STANDARD,
      timeout: Duration.seconds(30),
      definitionBody: aws_stepfunctions.DefinitionBody.fromChainable(
        ingestDocument
          .next(waitAndCheckIngestionStatus)
          .next(decideOnIngestionState),
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

class DocumentsEventsAPI extends aws_appsync.EventApi {
  static apiKeyName = "DocumentsEventsAPIApiKey";

  getApiKey: () => string;
  getEventsEndpoint: () => string;

  namespaceName = "events";

  constructor(scope: Construct) {
    super(scope, "DocumentsEventsAPI", {
      apiName: "DocumentsEventsAPI",
      authorizationConfig: {
        authProviders: [
          {
            authorizationType: aws_appsync.AppSyncAuthorizationType.API_KEY,
            apiKeyConfig: { name: DocumentsEventsAPI.apiKeyName },
          },
        ],
      },
      logConfig: {
        fieldLogLevel: aws_appsync.AppSyncFieldLogLevel.ALL,
        excludeVerboseContent: false,
        retention: RetentionDays.ONE_DAY,
      },
    });

    this.addChannelNamespace(this.namespaceName);

    this.getApiKey = () => {
      const apiKey = this.apiKeys[DocumentsEventsAPI.apiKeyName]?.attrApiKey;
      if (!apiKey) {
        throw new Error("Boom");
      }

      return apiKey;
    };

    this.getEventsEndpoint = () => {
      return `https://${this.httpDns}/event`;
    };
  }
}

/**
 * Taken from https://community.aws/content/2qf2QV7iPrfgLCMt4Irk9XCaWvm/serverless-chat-on-aws-with-appsync-events
 */
class DocumentsStatusPipe extends aws_pipes.Pipe {
  constructor(
    scope: Construct,
    {
      documentsTable,
      documentsEventsAPI,
    }: {
      documentsTable: ITableV2;
      documentsEventsAPI: DocumentsEventsAPI;
    },
  ) {
    const documentsStreamSource = new aws_pipes_sources.DynamoDBSource(
      documentsTable,
      {
        startingPosition: aws_pipes_sources.DynamoDBStartingPosition.LATEST,
      },
    );

    const documentsEventsAPIConnection = new aws_events.Connection(
      scope,
      "DocumentsEventsAPIConnection",
      {
        authorization: aws_events.Authorization.apiKey(
          "apiKey",
          SecretValue.unsafePlainText(documentsEventsAPI.getApiKey()),
        ),
      },
    );

    const documentsEventsAPIDestination = new aws_events.ApiDestination(
      scope,
      "DocumentsEventsAPIDestination",
      {
        connection: documentsEventsAPIConnection,
        endpoint: documentsEventsAPI.getEventsEndpoint(),
        httpMethod: HttpMethod.POST,
      },
    );

    const documentsEventsAPIDestinationTarget =
      new aws_pipes_targets.ApiDestinationTarget(
        documentsEventsAPIDestination,
        {
          inputTransformation: aws_pipes.InputTransformation.fromObject({
            channel: `/${documentsEventsAPI.namespaceName}/documents`,
            events: [
              JSON.stringify({
                id: "<$.dynamodb.NewImage.id.S>",
                originalFileName: "<$.dynamodb.NewImage.originalFileName.S>",
                status: "<$.dynamodb.NewImage.status.S>",
              }),
            ],
          }),
          headerParameters: {
            "X-Api-Key": documentsEventsAPI.getApiKey(),
            "Content-Type": "application/json",
          },
        },
      );

    const documentsPipeFilter = new aws_pipes.Filter([
      aws_pipes.FilterPattern.fromObject({
        eventName: ["INSERT", "MODIFY"],
      }),
    ]);

    const pipesLogs = new aws_pipes.CloudwatchLogsLogDestination(
      new aws_logs.LogGroup(scope, "DocumentsStatusPipeLogs2", {
        retention: RetentionDays.ONE_DAY,
      }),
    );

    super(scope, "DocumentsStatusPipe", {
      source: documentsStreamSource,
      target: documentsEventsAPIDestinationTarget,
      logLevel: aws_pipes.LogLevel.TRACE,
      logDestinations: [pipesLogs],
      logIncludeExecutionData: [aws_pipes.IncludeExecutionData.ALL],
      filter: documentsPipeFilter,
    });
  }
}

const stack = new AppStack(new App(), "BedrockChatWithDocumentStack");
Aspects.of(stack).add(new RemovalPolicyAspect());
