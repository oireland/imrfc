import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <h2 className="text-xl font-semibold">Sign in</h2>
      <SignInForm />
    </div>
  );
}
