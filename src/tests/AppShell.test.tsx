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

describe("AppShell sidebar", () => {
  it("サイドバーのトーナメントからトーナメント一覧を開く", () => {
    renderAppShell();

    expect(screen.getByRole("link", { name: "トーナメント" }).getAttribute("href")).toBe("/tournaments");
  });

  it("displays the compact brand, navigation icons, and related app heading", () => {
    renderAppShell();

    const header = document.querySelector(".sidebar-header");
    const link = screen.getByRole("link", { name: "MatchupLab" });
    const icon = document.querySelector(".related-app-icon");
    const externalLinkIcon = document.querySelector(".related-app-external-icon");

    expect(header?.firstElementChild?.classList.contains("brand")).toBe(true);
    expect(header?.lastElementChild?.classList.contains("sidebar-toggle")).toBe(true);
    const brandIcon = document.querySelector<HTMLImageElement>(".sidebar-brand-icon");
    const toggleIcon = document.querySelector(".sidebar-toggle-icon");

    expect(brandIcon?.tagName).toBe("IMG");
    expect(brandIcon?.getAttribute("src")).toBe("/draw-lab-icon.png");
    expect(toggleIcon?.querySelector("rect")).toBeNull();
    expect(toggleIcon?.querySelectorAll("path")).toHaveLength(2);
    expect(document.querySelectorAll(".sidebar-nav-icon")).toHaveLength(2);
    expect(link.getAttribute("href")).toBe("https://matchup-lab.bamboosato.com/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("title")).toBe("別タブでアプリを開きます");
    expect(icon?.getAttribute("src")).toBe("https://matchup-lab.bamboosato.com/favicon.ico");
    expect(externalLinkIcon?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("heading", { name: "関連アプリ" })).toBeTruthy();
    expect(screen.queryByText("対戦表作成・参加者管理")).toBeNull();
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

  it("renders the common mobile header with the app brand and menu button", () => {
    renderAppShell();

    const mobileHeader = document.querySelector(".mobile-header");
    const mobileBrand = document.querySelector<HTMLAnchorElement>(".mobile-brand");
    const mobileBrandIcon = document.querySelector<HTMLImageElement>(".mobile-brand-icon");
    const menuButton = screen.getByRole("button", { name: "メニューを開く" });

    expect(mobileHeader).toBeTruthy();
    expect(mobileBrand?.getAttribute("aria-label")).toBe("DrawLab トップへ");
    expect(mobileBrandIcon?.getAttribute("src")).toBe("/draw-lab-icon.png");
    expect(mobileBrand?.textContent).toContain("DrawLab");
    expect(menuButton.getAttribute("aria-controls")).toBe("global-navigation");
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the mobile drawer and closes it with the backdrop or Escape", () => {
    renderAppShell();

    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));

    const menuButton = document.querySelector<HTMLButtonElement>(".mobile-menu-toggle")!;
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".mobile-menu-backdrop")).toBeTruthy();
    expect(document.body.classList.contains("mobile-menu-open")).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("button", { name: "メニューを開く" })).toBeTruthy();
    expect(document.querySelector(".mobile-menu-backdrop")).toBeNull();
    expect(document.body.classList.contains("mobile-menu-open")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));
    fireEvent.click(document.querySelector<HTMLButtonElement>(".mobile-menu-backdrop")!);

    expect(screen.getByRole("button", { name: "メニューを開く" })).toBeTruthy();
  });

  it("closes the mobile drawer after selecting a navigation item", () => {
    renderAppShell();

    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));
    fireEvent.click(screen.getByRole("link", { name: "リーグ" }));

    expect(screen.getByRole("heading", { name: "リーグ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "メニューを開く" })).toBeTruthy();
    expect(document.querySelector(".mobile-menu-backdrop")).toBeNull();
  });

  it("closes the mobile drawer when the viewport returns to desktop width", () => {
    renderAppShell();

    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));

    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    fireEvent(window, new Event("resize"));

    expect(screen.getByRole("button", { name: "メニューを開く" })).toBeTruthy();
    expect(document.body.classList.contains("mobile-menu-open")).toBe(false);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
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
