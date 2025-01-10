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
  aws_events,
  aws_events_targets,
  aws_lambda,
  aws_lambda_nodejs,
  aws_s3,
  aws_secretsmanager,
  aws_stepfunctions,
} from "aws-cdk-lib";
import { CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { IBucket } from "aws-cdk-lib/aws-s3";
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

    const ingestionStateMachine = new IngestionStateMachine(this);

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
  constructor(scope: Construct) {
    const testStep = new aws_stepfunctions.Pass(scope, "TestStep");

    super(scope, "IngestionStateMachine", {
      stateMachineType: aws_stepfunctions.StateMachineType.STANDARD,
      definitionBody: aws_stepfunctions.DefinitionBody.fromChainable(testStep),
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

const stack = new AppStack(new App(), "BedrockChatWithDocumentStack");
Aspects.of(stack).add(new RemovalPolicyAspect());
