export function AbuseFiledNotice({
  reportId,
  justFiled = false,
  status,
}: {
  reportId: string;
  justFiled?: boolean;
  status?: string;
}) {
  const waiting = !status || status === "OPEN" || status === "UNDER_REVIEW" || status === "WAITING_FOR_REPORTER";
  if (!justFiled && !waiting) return null;

  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4">
      <div className="font-retro text-[10px] uppercase tracking-[0.16em] text-accent">
        {justFiled ? "Report sent" : "Abuse department"}
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">
        Report <span className="font-mono text-accent">{reportId}</span>
        {justFiled ? " is filed." : " is with the Abuse department."}
        {" "}
        Stand by for their response in this Command Center file. Email is only a ping — do not follow up in Discord.
      </p>
    </div>
  );
}
