"use client";
import { useState } from "react";
import { Button, Card, ErrorBox } from "../ui";
import { post, type StepProps } from "../useApp";

const DEMO_PRODUCT =
  "We sell AI-powered simulation and validation software for autonomous systems. Robotics and autonomous-vehicle teams use it to generate millions of edge-case scenarios, run them in a physics-accurate simulator, and prove safety before real-world deployment — cutting validation time and field-testing cost. It plugs into CI pipelines and supports ROS 2, sensor simulation (camera, lidar, radar) and safety standards such as ISO 26262 / UL 4600.";

export function Intake({ data, refresh, go }: StepProps) {
  const p = data.state.product;
  const [description, setDescription] = useState(p?.description ?? DEMO_PRODUCT);
  const [criteria, setCriteria] = useState(
    p?.criteria ?? { geography: "North America & Europe", companySize: "50–5,000 employees", budget: "$50k+ ACV", excluded: "Pure research labs, consumer drones", notes: "" },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (k: keyof typeof criteria, label: string, placeholder = "") => (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        value={criteria[k]}
        placeholder={placeholder}
        onChange={(e) => setCriteria({ ...criteria, [k]: e.target.value })}
      />
    </label>
  );

  async function submit(generate: boolean) {
    setLoading(true);
    setError(null);
    const r = await post("/api/intake", { description, criteria, fresh: !p || description !== p.description });
    if (!r.ok) {
      setError(r.error!);
      setLoading(false);
      return;
    }
    if (generate) {
      const r2 = await post("/api/icp");
      if (!r2.ok) setError(r2.error!);
      else go("icp");
    }
    await refresh();
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      <Card title="1 · Describe your product in plain language">
        <textarea
          className="h-40 w-full rounded-md border border-slate-300 p-3 text-sm leading-relaxed focus:border-indigo-500 focus:outline-none"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="mt-2 text-xs text-slate-500">Vertical: Physical AI / robotics. Write it like you would explain it to a new sales rep.</p>
      </Card>
      <Card title="Targeting criteria">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {field("geography", "Geography")}
          {field("companySize", "Company size")}
          {field("budget", "Budget / deal size")}
          {field("excluded", "Exclude")}
          <div className="md:col-span-2">{field("notes", "Anything else (optional)", "e.g. prefer teams already using ROS 2")}</div>
        </div>
      </Card>
      <ErrorBox error={error} />
      <div className="flex gap-3">
        <Button onClick={() => submit(true)} loading={loading}>
          Save & generate ICP
        </Button>
        <Button variant="secondary" onClick={() => submit(false)} disabled={loading}>
          Save only
        </Button>
      </div>
    </div>
  );
}
