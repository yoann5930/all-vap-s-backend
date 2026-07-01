"use client";

import { useEffect, useState } from "react";
import { AI_SERVICES } from "@/lib/ai";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export default function AdminAIPage() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");

  async function test(service: string) {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service, message: message || "Bonjour" }),
    });
    const data = await res.json();
    setResponse(data.content);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Architecture IA</h1>
      <p className="mt-1 text-gray-600">Services préparés pour intégration future (provider configurable via AI_PROVIDER).</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {AI_SERVICES.map((s) => (
          <Card key={s.id}>
            <CardBody>
              <h3 className="font-semibold">{s.name}</h3>
              <p className="mt-1 text-sm text-gray-600">{s.description}</p>
              <Button size="sm" className="mt-4" onClick={() => test(s.id)}>Tester (stub)</Button>
            </CardBody>
          </Card>
        ))}
      </div>
      {response && (
        <Card className="mt-6">
          <CardBody>
            <p className="text-sm">{response}</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
