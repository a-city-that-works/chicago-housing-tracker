import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SiteLayout } from "./layout/SiteLayout";
import { Home } from "./pages/Home";
import { Affordability } from "./pages/Affordability";
import { Glossary } from "./pages/Glossary";
import { IncomeBuilding } from "./pages/IncomeBuilding";
import { Permitting } from "./pages/Permitting";
import { SectionStub } from "./pages/SectionStub";
import { SECTIONS } from "./sections";
import "./styles/site.css";

/** Sections with a real page — these must not also get a stub route. */
const BUILT = new Set(["affordability", "permitting", "income"]);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="affordability" element={<Affordability />} />
          <Route path="glossary" element={<Glossary />} />
          <Route path="permitting" element={<Permitting />} />
          <Route path="income" element={<IncomeBuilding />} />
          {SECTIONS.filter((s) => !BUILT.has(s.slug)).map((s) => (
            <Route key={s.slug} path={s.slug} element={<SectionStub section={s} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
