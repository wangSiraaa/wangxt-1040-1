import { create } from "zustand";

export type UserRole = "车主" | "店员" | "运维" | "运营经理";

interface AppState {
  activeView: string;
  setActiveView: (view: string) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  bayRefreshTrigger: number;
  triggerBayRefresh: () => void;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: "/",
  setActiveView: (view) => set({ activeView: view }),
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  bayRefreshTrigger: 0,
  triggerBayRefresh: () =>
    set((state) => ({ bayRefreshTrigger: state.bayRefreshTrigger + 1 })),
  currentRole: "店员",
  setCurrentRole: (role) => set({ currentRole: role }),
}));

export const ROLE_PERMISSIONS: Record<UserRole, {
  canManageQueue: boolean;
  canMarkFault: boolean;
  canResolveFault: boolean;
  canReleaseBay: boolean;
  canViewOperations: boolean;
  canManageOrders: boolean;
  canOvertimeCharge: boolean;
  canChangePackage: boolean;
  canCancelOrder: boolean;
}> = {
  "车主": {
    canManageQueue: false,
    canMarkFault: false,
    canResolveFault: false,
    canReleaseBay: false,
    canViewOperations: false,
    canManageOrders: false,
    canOvertimeCharge: false,
    canChangePackage: false,
    canCancelOrder: false,
  },
  "店员": {
    canManageQueue: true,
    canMarkFault: true,
    canResolveFault: false,
    canReleaseBay: true,
    canViewOperations: false,
    canManageOrders: true,
    canOvertimeCharge: true,
    canChangePackage: true,
    canCancelOrder: true,
  },
  "运维": {
    canManageQueue: false,
    canMarkFault: true,
    canResolveFault: true,
    canReleaseBay: true,
    canViewOperations: false,
    canManageOrders: false,
    canOvertimeCharge: false,
    canChangePackage: false,
    canCancelOrder: false,
  },
  "运营经理": {
    canManageQueue: true,
    canMarkFault: true,
    canResolveFault: true,
    canReleaseBay: true,
    canViewOperations: true,
    canManageOrders: true,
    canOvertimeCharge: true,
    canChangePackage: true,
    canCancelOrder: true,
  },
};
