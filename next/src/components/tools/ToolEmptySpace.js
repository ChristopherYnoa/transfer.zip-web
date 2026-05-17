import { Button } from "../ui/button";

export default function ToolEmptySpace({ title, subtitle, onClick, buttonText, children }) {
  return (
    <div className="text-center py-16 px-6 rounded-xl border-dashed border-2 border-gray-300 bg-white">
      <h3 className="font-semibold text-2xl mb-1 text-gray-900">{title}</h3>
      <p className="text-gray-600 mx-auto max-w-xl">
        {subtitle}
      </p>
      {onClick && <Button size={"sm"} className="mt-4" onClick={onClick}>{buttonText} &rarr;</Button>}
      {children}
    </div>
  );
}
