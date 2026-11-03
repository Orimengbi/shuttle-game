import type { Metadata } from "next";
import { QirenApp } from "@/components/qiren-app";

export const metadata: Metadata = {
  title: "七人转 · 羽毛球单打轮转",
};

export default function ZhuanPage() {
  return <QirenApp />;
}
