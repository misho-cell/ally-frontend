import { redirect } from "next/navigation";

// D669 (9 Oct, the new design): automatic answers are off, and the app has
// no "answer rules" section anywhere. This address survives only so that a
// bookmark or an old link lands on the profile instead of a 404.
export default function AnswerRulesPage() {
  redirect("/profile");
}
