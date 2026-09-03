// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/PwaStatus", () => ({
  PwaStatus: () => null,
}));

import { AppShell } from "../components/AppShell";

afterEach(() => {
  cleanup();
});

describe("AppShell related app link", () => {
  it("サイドバーのトーナメントからトーナメント一覧を開く", () => {
    renderAppShell();

    expect(screen.getByRole("link", { name: "トーナメント" }).getAttribute("href")).toBe("/tournaments");
  });

  it("displays the MatchupLab link, favicon, and description", () => {
    renderAppShell();

    const link = screen.getByRole("link", { name: "MatchupLab" });
    const icon = document.querySelector(".related-app-icon");
    const externalLinkIcon = document.querySelector(".related-app-external-icon");

    expect(link.getAttribute("href")).toBe("https://matchup-lab.bamboosato.com/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("title")).toBe("別タブでアプリを開きます");
    expect(icon?.getAttribute("src")).toBe("https://matchup-lab.bamboosato.com/favicon.ico");
    expect(externalLinkIcon?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("対戦表作成・参加者管理")).toBeTruthy();
  });

  it("リーグ一覧はリーグと表示し、リーグ表は実際の表示画面名として残す", () => {
    render(
      <MemoryRouter initialEntries={["/leagues"]}>
        <AppShell>
          <div>本文</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "リーグ" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "リーグ" })).toBeTruthy();
  });

  it("hides the related app section when the sidebar is collapsed", () => {
    renderAppShell();

    fireEvent.click(screen.getByRole("button", { name: "サイドバーを折りたたむ" }));

    const appShell = document.querySelector(".app-shell");
    const relatedApps = document.querySelector(".related-apps");

    expect(appShell?.classList.contains("sidebar-collapsed")).toBe(true);
    expect(relatedApps?.hasAttribute("hidden")).toBe(true);
    expect(screen.queryByRole("link", { name: "MatchupLab" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "サイドバーを展開" }));

    expect(relatedApps?.hasAttribute("hidden")).toBe(false);
    expect(screen.getByRole("link", { name: "MatchupLab" })).toBeTruthy();
  });
});

describe("AppShell league stepper", () => {
  it("uses a five-step layout for league editing routes", () => {
    render(
      <MemoryRouter initialEntries={["/leagues/league-1/edit/basic"]}>
        <AppShell>
          <div>本文</div>
        </AppShell>
      </MemoryRouter>,
    );

    const stepper = document.querySelector(".stepper");
    expect(stepper?.classList.contains("stepper-league")).toBe(true);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("labels the group step as グループ設定", () => {
    render(
      <MemoryRouter initialEntries={["/leagues/league-1/edit/groups"]}>
        <AppShell>
          <div>本文</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("listitem", { name: "3. グループ設定（現在）" })).toBeTruthy();
  });
});

function renderAppShell() {
  return render(
    <MemoryRouter>
      <AppShell>
        <div>本文</div>
      </AppShell>
    </MemoryRouter>,
  );
}
