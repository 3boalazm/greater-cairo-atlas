import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="atlas-grid-bg flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>404 · Route Not Found</CardTitle>
          <CardDescription>
            The requested Greater Cairo Atlas page or resource does not exist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/">Return to Atlas overview</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
