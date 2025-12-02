
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
        canViewAll: userRole !== UserRole.USER,
        canApproveFinancial: userRole === UserRole.FINANCIAL || userRole === UserRole.ADMIN,
        canApproveManager: userRole === UserRole.MANAGER || userRole === UserRole.ADMIN,
        canApproveCeo: userRole === UserRole.CEO || userRole === UserRole.ADMIN,
        canEditOwn: true,
        canEditAll: userRole === UserRole.ADMIN || userRole === UserRole.CEO,
        canDeleteOwn: true,
        canDeleteAll: userRole === UserRole.ADMIN,
        canManageTrade: userRole === UserRole.ADMIN || userRole === UserRole.CEO || userRole === UserRole.MANAGER,
        canManageSettings: userRole === UserRole.ADMIN
    };

    if (!settings || !settings.rolePermissions || !settings.rolePermissions[userRole]) {
        if (userObject && userObject.canManageTrade) return { ...defaults, canManageTrade: true };
        return defaults;
    }
    
    const permissions = { ...defaults, ...settings.rolePermissions[userRole] };
    if (userObject && userObject.canManageTrade) permissions.canManageTrade = true;
    return permissions;
};
