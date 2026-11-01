import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../../../../packages/backend/convex/_generated/api";

export const Route = createFileRoute("/_providers/_authenticated/todos/")({
  component: Todos,
  errorComponent: () => <p role="alert">Unable to load todos.</p>,
});

function Todos() {
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
