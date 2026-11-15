import { redirect } from "next/navigation";

/** The front door of a signed-in person is Today. The proxy sends signed-out visitors to sign-in. */
export default function HomePage() {
  redirect("/today");
}
