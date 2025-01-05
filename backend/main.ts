import { App, Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

class AppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}

new AppStack(new App(), "BedrockChatWithDocumentStack");
