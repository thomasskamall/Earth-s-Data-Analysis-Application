import { useState } from "react";
import Intro from "./components/Intro";
import Workbench from "./components/Workbench";
import { ROLES, type RoleId } from "./roles";

export type Place = { lat: number; lon: number; name: string | null };

const KEY = "earthpulse-role";

function savedRole(): RoleId | null {
  try {
    const value = localStorage.getItem(KEY);
    return value && value in ROLES ? (value as RoleId) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [role, setRole] = useState<RoleId | null>(savedRole);

  function choose(next: RoleId | null) {
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {
      // the choice simply is not remembered
    }
    setRole(next);
  }

  if (!role) return <Intro onChoose={choose} />;
  return <Workbench key={role} role={ROLES[role]} onChangeRole={() => choose(null)} />;
}
