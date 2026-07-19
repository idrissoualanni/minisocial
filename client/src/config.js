const SERVER = "http://localhost:4000";

export const GRAPHQL_HTTP = `${SERVER}/graphql`;
export const GRAPHQL_WS = SERVER.replace("http", "ws") + "/graphql";
