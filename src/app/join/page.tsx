import type { Metadata } from "next";
import JoinClient from "./JoinClient";

export const metadata: Metadata = {
  title: "Netai · მოწვევა",
};

export default function JoinPage() {
  return <JoinClient />;
}
