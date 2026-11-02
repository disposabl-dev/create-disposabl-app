import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { authenticationEnabled } from "../../../../../../packages/disposabl-kit/features";
import { api } from "../../../../../../packages/backend/convex/_generated/api";

export const Route = createFileRoute("/_providers/_authenticated/todos/")({
  component: Todos,
  errorComponent: () => <p role="alert">Unable to load todos.</p>,
});

export function Todos({
  enabled = authenticationEnabled,
}: { enabled?: boolean } = {}) {
  if (!enabled)
    return <p>Todos require authentication, which is disabled for this app.</p>;
  return <AuthenticatedTodos />;
}

function AuthenticatedTodos() {
  const todos = useQuery(api.todos.index.list, {});

  return (
    <main>
      <h1>Todos</h1>
      {todos === undefined ? (
        <p>Loading todos…</p>
      ) : todos.length === 0 ? (
        <p>No todos yet.</p>
      ) : (
        <ul>
          {todos.map((todo) => (
            <li key={todo._id}>
              <Link to="/todos/$id" params={{ id: todo._id }}>
                {todo.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
