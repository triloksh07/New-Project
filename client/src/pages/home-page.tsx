import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const { user, logoutMutation } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Welcome, {user?.username}!</h1>
          <p className="text-muted-foreground mb-8">
            You've successfully logged in to the application.
          </p>
          <Button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
