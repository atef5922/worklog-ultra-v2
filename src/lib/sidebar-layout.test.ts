import { describe, expect, it } from "vitest";
import { getSidebarLayout } from "./sidebar-layout";

describe("scroll-free sidebar layout", () => {
  it("fits every Super Admin item in a typical laptop sidebar", () => {
    const result = getSidebarLayout({itemCount:13,availableHeight:480});
    expect(result.pageSize).toBe(13);
    expect(result.pageCount).toBe(1);
    expect(result.rowHeight).toBeGreaterThanOrEqual(32);
    expect(result.rowHeight * 13 + 12 * 2).toBeLessThanOrEqual(480);
  });
  it("does not stretch employee menus into oversized rows", () => {
    expect(getSidebarLayout({itemCount:7,availableHeight:700}).rowHeight).toBe(40);
  });
  it("paginates a short viewport instead of clipping menu items", () => {
    const result = getSidebarLayout({itemCount:13,availableHeight:270});
    expect(result.pageCount).toBeGreaterThan(1);
    expect(result.rowHeight).toBeGreaterThanOrEqual(32);
    expect(result.pageSize * result.rowHeight + (result.pageSize-1)*2 + 36).toBeLessThanOrEqual(270);
    const visited = Array.from({length:result.pageCount},(_,page)=>Array.from({length:result.pageSize},(_,i)=>page*result.pageSize+i)).flat().filter(i=>i<13);
    expect(visited).toEqual(Array.from({length:13},(_,i)=>i));
  });
  it("keeps 44px touch targets on mobile", () => {
    const result = getSidebarLayout({itemCount:13,availableHeight:430,minimumRowHeight:44,preferredRowHeight:44});
    expect(result.pageCount).toBe(2);
    expect(result.rowHeight).toBe(44);
  });
  it("handles the first render and an empty menu", () => {
    expect(getSidebarLayout({itemCount:13,availableHeight:0}).pageSize).toBe(13);
    expect(getSidebarLayout({itemCount:0,availableHeight:200}).pageCount).toBe(1);
  });
  it.each([160,240,320,400,480,600,900])("never overflows %ipx of measured space", height => {
    for (let count=1;count<=20;count++) {
      const result=getSidebarLayout({itemCount:count,availableHeight:height});
      const used=result.pageSize*result.rowHeight+(result.pageSize-1)*2+(result.pageCount>1?36:0);
      expect(used).toBeLessThanOrEqual(height+0.001);
    }
  });
});
