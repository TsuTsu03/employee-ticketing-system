export default function PageHeader(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{props.title}</h1>
        {props.subtitle && (
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">{props.subtitle}</p>
        )}
      </div>
      {props.right}
    </div>
  );
}
