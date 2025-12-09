
import { User, UserRole, SystemSettings, RolePermissions } from '../types';
import { apiCall } from './apiService';

const CURRENT_USER_KEY = 'app_current_user';

export const getUsers = async (): Promise<User[]> => {
    return await apiCall<User[]>('/users');
};

export const saveUser = async (user: User): Promise<User[]> => {
    return await apiCall<User[]>('/users', 'POST', user);
};

export const updateUser = async (user: User): Promise<User[]> => {
    return await apiCall<User[]>(`/users/${user.id}`, 'PUT', user);
};

export const deleteUser = async (id: string): Promise<User[]> => {
    return await apiCall<User[]>(`/users/${id}`, 'DELETE');
};

export const login = async (username: string, password: string): Promise<User | null> => {
    try {
        const user = await apiCall<User>('/login', 'POST', { username, password });
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        return user;
    } catch (e) {
        return null;
    }
};

export const logout = (): void => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

export const getCurrentUser = (): User | null => {
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  return stored ? JSON.parse(stored) : null;
};

export const hasPermission = (user: User | null, permissionType: string): boolean => {
  if (!user) return false;
  if (permissionType === 'manage_users') return user.role === UserRole.ADMIN;
  return false;
};

export const getRolePermissions = (userRole: string, settings: SystemSettings | null, userObject?: User): RolePermissions => {
    const defaults: RolePermissions = {
        canViewAll: userRole !== UserRole.USER && userRole !== UserRole.SALES_MANAGER && userRole !== UserRole.WAREHOUSE_KEEPER,
        
        // Default View Permissions
        // Warehouse keeper doesn't need to see payment orders by default
        canViewPaymentOrders: userRole !== UserRole.FACTORY_MANAGER && userRole !== UserRole.WAREHOUSE_KEEPER, 
        
        // Warehouse keeper and Factory Manager need to see exit permits
        canViewExitPermits: userRole === UserRole.ADMIN || userRole === UserRole.CEO || userRole === UserRole.SALES_MANAGER || userRole === UserRole.FACTORY_MANAGER || userRole === UserRole.WAREHOUSE_KEEPER,

        canApproveFinancial: userRole === UserRole.FINANCIAL || userRole === UserRole.ADMIN,
        canApproveManager: userRole === UserRole.MANAGER || userRole === UserRole.ADMIN,
        canApproveCeo: userRole === UserRole.CEO || userRole === UserRole.ADMIN,
        
        canEditOwn: true,
        canEditAll: userRole === UserRole.ADMIN || userRole === UserRole.CEO,
        canDeleteOwn: true,
        canDeleteAll: userRole === UserRole.ADMIN,
        
        // Sales Manager, CEO, Manager, Admin can manage trade
        canManageTrade: userRole === UserRole.ADMIN || userRole === UserRole.CEO || userRole === UserRole.MANAGER || userRole === UserRole.SALES_MANAGER,
        
        canManageSettings: userRole === UserRole.ADMIN,
        
        // Sales Manager creates requests
        canCreateExitPermit: userRole === UserRole.SALES_MANAGER || userRole === UserRole.ADMIN || userRole === UserRole.CEO,
        canApproveExitCeo: userRole === UserRole.CEO || userRole === UserRole.ADMIN,
        canApproveExitFactory: userRole === UserRole.FACTORY_MANAGER || userRole === UserRole.ADMIN,
        
        // Exit Archive Permissions
        canViewExitArchive: userRole === UserRole.ADMIN || userRole === UserRole.CEO || userRole === UserRole.FACTORY_MANAGER,
        canEditExitArchive: userRole === UserRole.ADMIN,

        // Warehouse Permissions
        canManageWarehouse: userRole === UserRole.ADMIN || userRole === UserRole.WAREHOUSE_KEEPER || userRole === UserRole.FACTORY_MANAGER, // Full Access
        canViewWarehouseReports: userRole === UserRole.ADMIN || userRole === UserRole.WAREHOUSE_KEEPER || userRole === UserRole.FACTORY_MANAGER || userRole === UserRole.CEO || userRole === UserRole.SALES_MANAGER // Read Only
    };

    if (!settings || !settings.rolePermissions || !settings.rolePermissions[userRole]) {
        if (userObject && userObject.canManageTrade) return { ...defaults, canManageTrade: true };
        return defaults;
    }
    
    const permissions = { ...defaults, ...settings.rolePermissions[userRole] };
    if (userObject && userObject.canManageTrade) permissions.canManageTrade = true;
    return permissions;
};
