import { Amplify } from "aws-amplify";
import { getEnv } from "./env";

Amplify.configure({
  API: {
    Events: {
      endpoint: getEnv().APPSYNC_EVENTS_API_URL,
      region: "eu-central-1",
      defaultAuthMode: "apiKey",
      apiKey: getEnv().APPSYNC_EVENTS_API_KEY,
    },
  },
});

export * from "aws-amplify/api";
