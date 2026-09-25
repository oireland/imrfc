import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Crest } from "@/components/crest";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
      <Crest />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h2 className="text-center font-heading text-4xl leading-none">Sign in</h2>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
