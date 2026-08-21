import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApolloProvider } from "@apollo/client/react";
import client from "./apollo";
import QueryProvider from "./providers/QueryProvider";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <QueryProvider>
        <App />
      </QueryProvider>
    </ApolloProvider>
  </StrictMode>
);
