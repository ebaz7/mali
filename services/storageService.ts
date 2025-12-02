
import { PaymentOrder, User, UserRole, OrderStatus, SystemSettings, ChatMessage, ChatGroup, GroupTask, TradeRecord } from '../types';
import { apiCall } from './apiService';

export const getOrders = async (): Promise<PaymentOrder[]> => {
    return await apiCall<PaymentOrder[]>('/orders');
};

export const saveOrder = async (order: PaymentOrder): Promise<PaymentOrder[]> => {
    return await apiCall<PaymentOrder[]>('/orders', 'POST', order);
};

export const editOrder = async (updatedOrder: PaymentOrder): Promise<PaymentOrder[]> => {
    return await apiCall<PaymentOrder[]>(`/orders/${updatedOrder.id}`, 'PUT', updatedOrder);
};

export const updateOrderStatus = async (id: string, status: OrderStatus, approverUser: User, rejectionReason?: string): Promise<PaymentOrder[]> => {
  const orders = await getOrders();
  const order = orders.find(o => o.id === id);
  if (order) {
      const updates: any = { status };
      if (approverUser.role === UserRole.FINANCIAL) updates.approverFinancial = approverUser.fullName;
      if (approverUser.role === UserRole.MANAGER) updates.approverManager = approverUser.fullName;
      if (approverUser.role === UserRole.CEO) updates.approverCeo = approverUser.fullName;
      if (approverUser.role === UserRole.ADMIN) {
          if (status === OrderStatus.APPROVED_FINANCE) updates.approverFinancial = approverUser.fullName;
          if (status === OrderStatus.APPROVED_MANAGER) updates.approverManager = approverUser.fullName;
          if (status === OrderStatus.APPROVED_CEO) updates.approverCeo = approverUser.fullName;
      }
      if (status === OrderStatus.REJECTED) {
          if (rejectionReason) updates.rejectionReason = rejectionReason;
          updates.rejectedBy = approverUser.fullName; // Record who rejected it
      }
      const updatedOrder = { ...order, ...updates };
      return await apiCall<PaymentOrder[]>(`/orders/${id}`, 'PUT', updatedOrder);
  }
  return orders;
};

export const deleteOrder = async (id: string): Promise<PaymentOrder[]> => {
    return await apiCall<PaymentOrder[]>(`/orders/${id}`, 'DELETE');
};

export const getSettings = async (): Promise<SystemSettings> => {
    return await apiCall<SystemSettings>('/settings');
};

export const saveSettings = async (settings: SystemSettings): Promise<SystemSettings> => {
    return await apiCall<SystemSettings>('/settings', 'POST', settings);
};

export const getNextTrackingNumber = async (): Promise<number> => {
    try {
        const response = await apiCall<{ nextTrackingNumber: number }>('/next-tracking-number');
        return response.nextTrackingNumber;
    } catch (e) {
        // Fallback for offline mode if API fails
        const settings = await getSettings();
        return settings.currentTrackingNumber + 1;
    }
};

export const restoreSystemData = async (backupData: any): Promise<void> => {
    await apiCall('/restore', 'POST', backupData);
};

export const getMessages = async (): Promise<ChatMessage[]> => { return await apiCall<ChatMessage[]>('/chat'); };
export const sendMessage = async (message: ChatMessage): Promise<ChatMessage[]> => { return await apiCall<ChatMessage[]>('/chat', 'POST', message); };
export const deleteMessage = async (id: string): Promise<ChatMessage[]> => { return await apiCall<ChatMessage[]>(`/chat/${id}`, 'DELETE'); };
export const getGroups = async (): Promise<ChatGroup[]> => { return await apiCall<ChatGroup[]>('/groups'); };
export const createGroup = async (group: ChatGroup): Promise<ChatGroup[]> => { return await apiCall<ChatGroup[]>('/groups', 'POST', group); };
export const deleteGroup = async (id: string): Promise<ChatGroup[]> => { return await apiCall<ChatGroup[]>(`/groups/${id}`, 'DELETE'); };
export const getTasks = async (): Promise<GroupTask[]> => { return await apiCall<GroupTask[]>('/tasks'); };
export const createTask = async (task: GroupTask): Promise<GroupTask[]> => { return await apiCall<GroupTask[]>('/tasks', 'POST', task); };
export const updateTask = async (task: GroupTask): Promise<GroupTask[]> => { return await apiCall<GroupTask[]>(`/tasks/${task.id}`, 'PUT', task); };
export const deleteTask = async (id: string): Promise<GroupTask[]> => { return await apiCall<GroupTask[]>(`/tasks/${id}`, 'DELETE'); };
export const getTradeRecords = async (): Promise<TradeRecord[]> => { return await apiCall<TradeRecord[]>('/trade'); };
export const saveTradeRecord = async (record: TradeRecord): Promise<TradeRecord[]> => { return await apiCall<TradeRecord[]>('/trade', 'POST', record); };
export const updateTradeRecord = async (record: TradeRecord): Promise<TradeRecord[]> => { return await apiCall<TradeRecord[]>(`/trade/${record.id}`, 'PUT', record); };
export const deleteTradeRecord = async (id: string): Promise<TradeRecord[]> => { return await apiCall<TradeRecord[]>(`/trade/${id}`, 'DELETE'); };
export const uploadFile = async (fileName: string, fileData: string): Promise<{ fileName: string, url: string }> => { return await apiCall<{ fileName: string, url: string }>('/upload', 'POST', { fileName, fileData }); };
