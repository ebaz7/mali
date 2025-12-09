
import { PaymentOrder, User, UserRole, OrderStatus, SystemSettings, ChatMessage, ChatGroup, GroupTask, TradeRecord, ExitPermit, ExitPermitStatus, WarehouseItem, WarehouseTransaction } from '../types';
import { apiCall } from './apiService';

// ... Existing methods for Orders ...
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
          updates.rejectedBy = approverUser.fullName; 
      }
      const updatedOrder = { ...order, ...updates };
      return await apiCall<PaymentOrder[]>(`/orders/${id}`, 'PUT', updatedOrder);
  }
  return orders;
};

export const deleteOrder = async (id: string): Promise<PaymentOrder[]> => {
    return await apiCall<PaymentOrder[]>(`/orders/${id}`, 'DELETE');
};

// --- NEW: Exit Permits ---
export const getExitPermits = async (): Promise<ExitPermit[]> => {
    return await apiCall<ExitPermit[]>('/exit-permits');
};

export const saveExitPermit = async (permit: ExitPermit): Promise<ExitPermit[]> => {
    return await apiCall<ExitPermit[]>('/exit-permits', 'POST', permit);
};

export const updateExitPermitStatus = async (id: string, status: ExitPermitStatus, approverUser: User, rejectionReason?: string): Promise<ExitPermit[]> => {
    const permits = await getExitPermits();
    const permit = permits.find(p => p.id === id);
    if(permit) {
        const updates: any = { status };
        if (status === ExitPermitStatus.PENDING_FACTORY && (approverUser.role === UserRole.CEO || approverUser.role === UserRole.ADMIN)) {
            updates.approverCeo = approverUser.fullName;
        }
        if (status === ExitPermitStatus.EXITED && (approverUser.role === UserRole.FACTORY_MANAGER || approverUser.role === UserRole.ADMIN)) {
            updates.approverFactory = approverUser.fullName;
        }
        if (status === ExitPermitStatus.REJECTED) {
            updates.rejectionReason = rejectionReason || 'بدون دلیل';
            updates.rejectedBy = approverUser.fullName;
        }
        const updatedPermit = { ...permit, ...updates };
        return await apiCall<ExitPermit[]>(`/exit-permits/${id}`, 'PUT', updatedPermit);
    }
    return permits;
};

export const deleteExitPermit = async (id: string): Promise<ExitPermit[]> => {
    return await apiCall<ExitPermit[]>(`/exit-permits/${id}`, 'DELETE');
};

export const getNextExitPermitNumber = async (): Promise<number> => {
    try {
        const response = await apiCall<{ nextNumber: number }>('/next-exit-permit-number');
        return response.nextNumber;
    } catch(e) {
        const settings = await getSettings();
        return (settings.currentExitPermitNumber || 1000) + 1;
    }
};

// ... Existing methods for Settings ...
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
        const settings = await getSettings();
        return settings.currentTrackingNumber + 1;
    }
};

export const restoreSystemData = async (backupData: any): Promise<void> => {
    await apiCall('/restore', 'POST', backupData);
};

// ... Chat & Trade methods (kept same) ...
export const getMessages = async (): Promise<ChatMessage[]> => { return await apiCall<ChatMessage[]>('/chat'); };
export const sendMessage = async (message: ChatMessage): Promise<ChatMessage[]> => { return await apiCall<ChatMessage[]>('/chat', 'POST', message); };
export const updateMessage = async (message: ChatMessage): Promise<ChatMessage[]> => { return await apiCall<ChatMessage[]>(`/chat/${message.id}`, 'PUT', message); };
export const deleteMessage = async (id: string): Promise<ChatMessage[]> => { return await apiCall<ChatMessage[]>(`/chat/${id}`, 'DELETE'); };
export const getGroups = async (): Promise<ChatGroup[]> => { return await apiCall<ChatGroup[]>('/groups'); };
export const createGroup = async (group: ChatGroup): Promise<ChatGroup[]> => { return await apiCall<ChatGroup[]>('/groups', 'POST', group); };
export const updateGroup = async (group: ChatGroup): Promise<ChatGroup[]> => { return await apiCall<ChatGroup[]>(`/groups/${group.id}`, 'PUT', group); };
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

// --- WAREHOUSE SERVICE ---
export const getWarehouseItems = async (): Promise<WarehouseItem[]> => {
    return await apiCall<WarehouseItem[]>('/warehouse/items');
};

export const saveWarehouseItem = async (item: WarehouseItem): Promise<WarehouseItem[]> => {
    return await apiCall<WarehouseItem[]>('/warehouse/items', 'POST', item);
};

export const updateWarehouseItem = async (item: WarehouseItem): Promise<WarehouseItem[]> => {
    return await apiCall<WarehouseItem[]>(`/warehouse/items/${item.id}`, 'PUT', item);
};

export const deleteWarehouseItem = async (id: string): Promise<WarehouseItem[]> => {
    return await apiCall<WarehouseItem[]>(`/warehouse/items/${id}`, 'DELETE');
};

export const getWarehouseTransactions = async (): Promise<WarehouseTransaction[]> => {
    return await apiCall<WarehouseTransaction[]>('/warehouse/transactions');
};

export const saveWarehouseTransaction = async (tx: WarehouseTransaction): Promise<WarehouseTransaction[]> => {
    if (tx.type === 'OUT' && !tx.id.includes('updated')) { // Only increment seq for new Bijaks
        const settings = await getSettings();
        const currentSeq = settings.warehouseSequences?.[tx.company] || 1000;
        
        // Check if number is manually set to something else, if not or 0, generate it
        if (!tx.number || tx.number === 0) {
             const newSeq = currentSeq + 1;
             await saveSettings({
                ...settings,
                warehouseSequences: {
                    ...settings.warehouseSequences,
                    [tx.company]: newSeq
                }
            });
            tx.number = newSeq;
        }
    }
    return await apiCall<WarehouseTransaction[]>('/warehouse/transactions', 'POST', tx);
};

export const updateWarehouseTransaction = async (tx: WarehouseTransaction): Promise<WarehouseTransaction[]> => {
    return await apiCall<WarehouseTransaction[]>(`/warehouse/transactions/${tx.id}`, 'PUT', tx);
};

export const deleteWarehouseTransaction = async (id: string): Promise<WarehouseTransaction[]> => {
    return await apiCall<WarehouseTransaction[]>(`/warehouse/transactions/${id}`, 'DELETE');
};

export const getNextBijakNumber = async (company: string): Promise<number> => {
    const settings = await getSettings();
    return (settings.warehouseSequences?.[company] || 1000) + 1;
};
