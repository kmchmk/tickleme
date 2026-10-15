"use client";

import { SignUp } from "@clerk/nextjs";

export default function JoinForm() {
  return <SignUp routing="hash" signInUrl="/" fallbackRedirectUrl="/" />;
}
