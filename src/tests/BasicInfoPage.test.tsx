// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, updateTournamentMock, useTournamentMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  updateTournamentMock: vi.fn(),
  useTournamentMock: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "tournament-1" }),
}));

vi.mock("../app/TournamentProvider", () => ({
  useTournament: useTournamentMock,
  useTournaments: () => ({ updateTournament: updateTournamentMock }),
}));

vi.mock("../app/viewTransitionNavigation", () => ({
  useViewTransitionNavigate: () => navigateMock,
}));

import { BasicInfoPage } from "../pages/BasicInfoPage";
import { makeTournament } from "./testFactory";

afterEach(cleanup);

beforeEach(() => {
  navigateMock.mockReset();
  updateTournamentMock.mockReset();
  useTournamentMock.mockReset();
  useTournamentMock.mockReturnValue(makeTournament());
});

describe("BasicInfoPage", () => {
  it("種目区分にチームを表示する", () => {
    const { container } = render(<BasicInfoPage />);

    expect(Array.from(container.querySelectorAll("select option"), (option) => option.textContent)).toContain("チーム");
  });

  it("仕様上の必須項目だけに名簿入力と同じ必須印を表示する", () => {
    const { container } = render(<BasicInfoPage />);
    const fields = Array.from(container.querySelectorAll<HTMLLabelElement>("label.field"));

    expectRequiredMarker(fields, "種目区分");
    expectRequiredMarker(fields, "ドローサイズ");
    expectRequiredMarker(fields, "シード数");

    for (const optionalLabel of ["大会名", "開催日", "会場", "種目名"]) {
      expect(getField(fields, optionalLabel).querySelector(".required-marker")).toBeNull();
    }
  });
});

function expectRequiredMarker(fields: HTMLLabelElement[], label: string): void {
  const marker = getField(fields, label).querySelector<HTMLElement>(".required-marker");

  expect(marker?.textContent).toBe("*");
  expect(marker?.getAttribute("aria-label")).toBe("必須");
}

function getField(fields: HTMLLabelElement[], label: string): HTMLLabelElement {
  const field = fields.find((candidate) => candidate.textContent?.startsWith(label));

  if (!field) {
    throw new Error(`${label}の入力欄が見つかりません。`);
  }

  return field;
}
