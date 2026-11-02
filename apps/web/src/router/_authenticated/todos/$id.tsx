import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { authenticationEnabled } from "../../../../../../packages/disposabl-kit/features";
import { api } from "../../../../../../packages/backend/convex/_generated/api";
import type { Id } from "../../../../../../packages/backend/convex/_generated/dataModel";

export const Route = createFileRoute("/_providers/_authenticated/todos/$id")({
  component: Todo,
  errorComponent: () => <p role="alert">Unable to load todo.</p>,
});

export function Todo({
  enabled = authenticationEnabled,
}: { enabled?: boolean } = {}) {
  if (!enabled)
    return <p>Todos require authentication, which is disabled for this app.</p>;
  return <AuthenticatedTodo />;
}

function AuthenticatedTodo() {
  const { id } = Route.useParams();
  const todo = useQuery(api.todos.index.get, { id: id as Id<"todos"> });

  return (
    <main>
      <Link to="/todos">Todos</Link>
      {todo === undefined ? (
        <p>Loading todo…</p>
      ) : todo === null ? (
        <p>Todo not found.</p>
      ) : (
        <h1>{todo.title}</h1>
      )}
    </main>
  );
}
