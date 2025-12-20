import { useState } from "react";
import { Button } from "../generic/Button";
import { Loader2 } from "lucide-react";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const apiUrl =
    typeof window !== "undefined"
      ? import.meta.env.PUBLIC_VITE_API_URL || "http://localhost:3001"
      : "http://localhost:3001";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus("idle");
    setMessage("");

    try {
      const response = await fetch(`${apiUrl}/internal/public/waitlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus("success");
        setMessage(
          data.alreadyExists
            ? "You're already on the waitlist!"
            : "Successfully added to waitlist! Check your email for confirmation."
        );
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch (error) {
      setStatus("error");
      setMessage("Failed to connect. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-y-3 w-full">
      <form onSubmit={handleSubmit} className="flex flex-row gap-x-2 w-full">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
          disabled={isSubmitting}
          className="flex-1 px-3 py-1.5 text-[14px] h-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <Button
          type="submit"
          size="lg"
          isDisabled={isSubmitting || !email.trim()}
          className="shrink-0"
        >
          {isSubmitting ? (
            <div className="flex items-center gap-x-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Joining...</span>
            </div>
          ) : (
            <span>Join waitlist</span>
          )}
        </Button>
      </form>
      {status !== "idle" && (
        <p
          className={`text-sm text-center ${
            status === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
