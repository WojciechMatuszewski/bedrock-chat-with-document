import { App } from "aws-cdk-lib";
import { Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";

class BedrockChatWithDocumentStack extends Stack {
  constructor(scope: Construct) {
    super(scope, "BedrockChatWithDocument", {});
  }
}

const app = new App();
new BedrockChatWithDocumentStack(app);
