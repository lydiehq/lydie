import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_landing/blog/")({
  component: RouteComponent,
  loader: async () => {
    const posts = await fetch(
      import.meta.env.VITE_API_URL.replace(/\/+$/, "") +
        "/internal/public/blog",
      { credentials: "include" }
    );
    const data = await posts.json();
    console.log(data);
    return {
      posts: data.documents,
    };
  },
});

function RouteComponent() {
  const { posts } = Route.useLoaderData();
  return (
    <div>
      <ul>
        {posts.map((post: any) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      <pre className="text-sm">{JSON.stringify({ posts }, null, 2)}</pre>
    </div>
  );
}
