# Learnings

- To get the list of files that `eslint` "found", you will need to run `eslint` with the `DEBUG` flag.

  ```sh
  DEBUG=eslint:eslint eslint .
  ```

- The `eslint` is quite hard to set up for monorepos.

  - Before the v9, we could have multiple config files in each package.

  - In v9, there is a feature flag to preserve that behavior, but I did not manage to make it work.

    - Instead, I decided it would be easier to have each package define `eslint.config.js` file separately.

- It looks like you can define both the `qualifier` AND the `toolkitName` in the `cdk.json` file.

  - This is quite nice, as you no longer have to duplicate the `qualifier` between the `cdk deploy` in `package.json` and the `qualifier` prop in the CDK code!

- It is such a pity that the `PineconeVectorStore` construct requires the credentials to use Secrets Manager.

  - I would love to switch to Parameter Store secrets and not have to pay for Secrets Manager usage.

- **The `connectionString` parameter you must pass to `PineconeVectorStore` MUST be a well-formed HTTP address**.

  - Initially, I thought that I will create a "placeholder" value for an SSM parameter and use it there, but CloudFormation rejected that update.

    - In the end, I decided to load that value via environment variables.

      - Side note: I'm very glad that Node now has a built-in way to load environment variables! [Check out the documentation here](https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs).

- **When building the Amazon Bedrock knowledge base** the _format_ of the **value held in the secrets manager for the Pinecone API key needed to be `apiKey: VALUE`**.

  - I wonder why such constraint. Why not accept the _value_ of the secret as the _apiKey_?

- **When you create the `PineconeVectorStore` resource, the resource WILL CHECK IF THE CREDENTIALS YOU SPECIFIED ARE CORRECT**.

  - This means you **CANT create "placeholder" secrets and then fill them in AWS console**. For the secret, you have to create it manually in AWS Console, and then reference it in CFN.

- **I got stuck while trying to use a secret via `fromSecretNameV2` method**.

  - The documentation mentions that this function **returns a "partial arn"** which could lead to `AccessDenied` exceptions when using it alongside CLI or SDK.

    - According to the ChatGPT, the "partial arn" is ARN with region, and account portions omitted.

- I'm baffled by the fact that most Bedrock models (and other models as well) are not available on `eu-west-1` region.

- When working with S3 POST request and parameters on the frontend, **remember that the `file` key has to be the last in the `formData` payload**.

  - AWS ignores all data that appears _after_ the `key` key.

- The `useActionState` is an interesting hook.

  - You have to annotate the file with `use client` to use it, but you can import and pass to it actions from a file annotated with `use server`.

    - I think I'm confusing the `use server` with `server-only` pragma.

      - The `use server` pragma means **"take all exports from this file and turn them into server endpoints"**.

        - This means that they can be used in both client and server contexts BUT they run on the server.

      - The `server only` pragma means **"this file can only be imported in the server context"**.

- You can make your data available to Bedrock via Knowledge bases in two ways.

  1. You can use the `StartIngestionJob` operation.
     1. Scans the entire S3 data source.
     2. Checks each document if it's already indexed in vector store.
     3. Used when you want to sync all S3 bucket changes.
  2. You can use the `IngestKnowledgeBaseDocuments` operation.
     1. Directly indexes specific documents into vector store.
     2. Skips S3 scanning step.
     3. Faster for individual document updates.
     4. Changes are NOT reflected in S3 bucket.

  So, it seems like the `StartIngestionJob` is more akin to a bach process where you want to perform updates at scale.

  The `IngestKnowledgeBaseDocuments` is for one-off updates – ideal for our use-case!

- **Both** the `StartIngestionJob` and `IngestKnowledgeBaseDocuments` are async operations.

  - I wish Step Functions would support a `.sync` task for those, but that is not the case.

- The AWS Console does not help at all with debugging failed `IngestKnowledgeBaseDocuments` job.

  - You will see them listed as "failed", but the UI fails to displays the _reason_ for the failure :C

- **AWS stories S3 object metadata keys in _all lowercase_**.

  - For example, `originalFileName` becomes `originalfilename`.

- When ingesting documents into Bedrock, I had to change the name of the file from `data.txt` to `data`. Otherwise, when trying to ingest metadata for that file, Bedrock would reject files named `data.txt.metadata.json`.

- **The `.metadata.json` file has to have specific structure**. There must be `metadataAttributes` key containing the attributes. Otherwise it won't work!

- **It appears that Bedrock won't emit events related to the `IngestKnowledgeBaseDocuments` API**. [Link to the documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-eventbridge.html).

  - Such a shame. I was hoping I could use EventBridge with "wait for callback" StepFunction pattern to continue the state machine when ingestion is done.

    - To notify the FE about the changes, and update state in the database, I have to implement the "wait loop" in the state function. Not a big deal, but it makes the state machine definition harder to read.

- While writing Step Functions definitions, I can't shake the feeling that It would be awesome to have some kind of type safety for parameters I'm passing from one state to another.

  - For now, the `JsonPath` are strings scattered throughout the cdk file. Perhaps there is some pattern out there to give me that type safety?

- There are multiple ways to invoke a state machine from another state machine. In my case, I need to wait until the "ingestion" state machine finishes before completing the "parent" state machine.

- **When using AppSync Events API, you must specify the _namespace_**. Otherwise the API will reject your request.

  - I was quite confused when I tried to test things in the console and my request were rejected to to permissions issue.

    - It turns out that my IC definition did not create any namespaces!

- Making sure you log all the events of the EventBridge Pipe will save you lots of time when debugging issues.

- **For some reason, I could not send the _whole_ DynamoDB "change record" to AppSync Events due to serialization issues**.

  ```
    inputTransformation: aws_pipes.InputTransformation.fromObject({
      channel: `/${documentsEventsAPI.namespaceName}/documents`,
      events: [{ dynamodbEvent: "<$.dynamodb.NewImage>" }], -> this would not work.
    })
  ```

  I had to extract the relevant data from `NewImage`.

- The Amazon Bedrock Agents have a native capability to remember the chat history. Quite handy!

  - Memory summarization is only available for certain models.

- The default quotas for new accounts for Amazon Bedrock are quite laughable. We are talking **four** requests a minute for some models. I wonder why is that the case? To prevent abuse?

- **Instead of fighting with the AWS Lambda lackluster streaming capabilities**, consider **using Websockets (perhaps AppSync events API?) to stream down responses**.

  - If you _really_ want to use the response streaming, you might find the following type declarations handy. [Example usage](https://github.com/llozano/lambda-stream-response/blob/main/src/report.ts).

    ```ts
    declare global {
      // eslint-disable-next-line @typescript-eslint/no-namespace
      namespace awslambda {
        // eslint-disable-next-line @typescript-eslint/no-namespace
        export namespace HttpResponseStream {
          function from(writable: Writable, metadata: unknown): Writable;
        }

        export type StreamifyHandler<TEvent> = (
          event: TEvent,
          responseStream: Writable,
          context: Context,
        ) => Promise<unknown>;

        export function streamifyResponse<TEvent, TResponse>(
          handler: StreamifyHandler<TEvent>,
        ): Handler<TEvent, TResponse>;
      }
    }
    ```
