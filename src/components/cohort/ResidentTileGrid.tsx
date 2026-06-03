import type { CohortResident } from "@/data/cohortMockData";
import ResidentTile from "./ResidentTile";

interface Props {
  residents: CohortResident[];
  onSelect: (id: string) => void;
}

export default function ResidentTileGrid({ residents, onSelect }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {residents.map((r) => (
        <ResidentTile key={r.id} resident={r} onClick={() => onSelect(r.id)} />
      ))}
    </div>
  );
}
