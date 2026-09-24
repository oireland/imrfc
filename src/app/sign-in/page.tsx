import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h2 className="text-center text-xl font-semibold">Sign in</h2>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
