// Configuration
const CONFIG = {
    // Your Apps Script Web App URL (with /exec)
    API_URL: 'https://script.google.com/macros/s/AKfycbyS6b9m-XQge5W97m4VQF4hQxbnN5rqhDIlVrevuLT8GemO_YglzMM8QrfpPxyc4nBZMA/exec',
    
    // Your Google Sheet ID
    SHEET_ID: '1SalTDywX5hBrD14vJxvQ4Uvb0zexb1jJFRZ6OJQ06s4',
    
    // App settings
    VERSION: '1.0',
    LOCAL_STORAGE_KEY: 'hostel_transactions',
    PENDING_KEY: 'pending_transactions'
};

// Global state
let transactions = [];
let pendingTransactions = [];
let currentFilter = 'all';

// DOM Elements
let incomeForm, expenseForm, transactionList, totalBalance, totalIncome, totalExpense;
let refreshBtn, syncLocalBtn, clearLocalBtn, filterButtons;
let connectionIcon, connectionText, localStatus, apiUrlElement;

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    console.log('🏠 Hostel Finance Manager v' + CONFIG.VERSION);
    console.log('📊 API URL:', CONFIG.API_URL);
    
    // Initialize DOM elements
    initializeDOMElements();
    
    // Display API URL
    apiUrlElement.textContent = CONFIG.API_URL.substring(0, 60) + '...';
    
    // Load data
    loadLocalData();
    updateLocalStatus();
    
    // Set up event listeners
    setupEventListeners();
    
    // Try to load from Google Sheets
    loadFromGoogleSheets();
    
    // Initial UI update
    updateDashboard();
    displayTransactions();
});

// Initialize DOM Elements
function initializeDOMElements() {
    incomeForm = document.getElementById('incomeForm');
    expenseForm = document.getElementById('expenseForm');
    transactionList = document.getElementById('transactionList');
    totalBalance = document.getElementById('totalBalance');
    totalIncome = document.getElementById('totalIncome');
    totalExpense = document.getElementById('totalExpense');
    refreshBtn = document.getElementById('refreshBtn');
    syncLocalBtn = document.getElementById('syncLocalBtn');
    clearLocalBtn = document.getElementById('clearLocalBtn');
    filterButtons = document.querySelectorAll('.filter-btn');
    connectionIcon = document.getElementById('connectionIcon');
    connectionText = document.getElementById('connectionText');
    localStatus = document.getElementById('localStatus');
    apiUrlElement = document.getElementById('apiUrl');
}

// Set up event listeners
function setupEventListeners() {
    // Income form
    incomeForm.addEventListener('submit', function(e) {
        e.preventDefault();
        addTransaction('income');
    });
    
    // Expense form
    expenseForm.addEventListener('submit', function(e) {
        e.preventDefault();
        addTransaction('expense');
    });
    
    // Filter buttons
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Update active button
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Set filter and refresh
            currentFilter = this.dataset.filter;
            displayTransactions();
        });
    });
    
    // Refresh button
    refreshBtn.addEventListener('click', function() {
        this.disabled = true;
        this.innerHTML = '⏳ Loading...';
        
        loadFromGoogleSheets();
        
        setTimeout(() => {
            this.disabled = false;
            this.innerHTML = '🔄 Refresh Data';
        }, 2000);
    });
    
    // Sync local data button
    syncLocalBtn.addEventListener('click', function() {
        syncPendingTransactions();
    });
    
    // Clear local data button
    clearLocalBtn.addEventListener('click', function() {
        if (confirm('Clear all locally saved transactions?')) {
            clearLocalData();
        }
    });
}

// Add a transaction (income or expense)
function addTransaction(type) {
    const form = type === 'income' ? incomeForm : expenseForm;
    const nameInput = type === 'income' ? 'incomeName' : 'expenseName';
    const amountInput = type === 'income' ? 'incomeAmount' : 'expenseAmount';
    const descInput = type === 'income' ? 'incomeDesc' : 'expenseDesc';
    
    const transaction = {
        id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: type,
        name: document.getElementById(nameInput).value,
        amount: parseFloat(document.getElementById(amountInput).value),
        description: document.getElementById(descInput).value || '',
        date: new Date().toISOString(),
        status: 'pending' // pending, synced, failed
    };
    
    // Validate
    if (!transaction.name || !transaction.amount || transaction.amount <= 0) {
        showNotification('Please enter valid name and amount', 'error');
        return;
    }
    
    // Add to pending transactions
    pendingTransactions.push(transaction);
    savePendingTransactions();
    
    // Also add to main transactions for immediate display
    transactions.unshift(transaction);
    
    // Update UI
    updateDashboard();
    displayTransactions();
    updateLocalStatus();
    
    // Reset form
    form.reset();
    
    // Show success message
    showNotification(`${type === 'income' ? 'Income' : 'Expense'} added successfully!`, 'success');
    
    // Try to sync immediately
    setTimeout(() => {
        syncSingleTransaction(transaction);
    }, 1000);
}

// Load data from Google Sheets using JSONP
function loadFromGoogleSheets() {
    updateConnectionStatus('🟡', 'Connecting to Google Sheets...');
    
    // Create unique callback name
    const callbackName = 'jsonpCallback_' + Date.now();
    
    // Create script tag for JSONP
    const script = document.createElement('script');
    script.src = `${CONFIG.API_URL}?action=getTransactions&callback=${callbackName}`;
    
    // Define the callback function
    window[callbackName] = function(data) {
        console.log('📥 Data received from Google Sheets:', data);
        
        if (data && data.transactions) {
            // Process and merge with local data
            processRemoteTransactions(data.transactions);
            updateConnectionStatus('✅', 'Connected to Google Sheets');
        } else {
            updateConnectionStatus('⚠️', 'No data received');
        }
        
        // Clean up
        delete window[callbackName];
        document.head.removeChild(script);
    };
    
    // Add error handling
    script.onerror = function() {
        console.error('❌ Failed to load from Google Sheets');
        updateConnectionStatus('❌', 'Connection failed - using local data');
        
        // Clean up
        delete window[callbackName];
        if (script.parentNode) {
            document.head.removeChild(script);
        }
    };
    
    // Add to page to trigger request
    document.head.appendChild(script);
    
    // Also load summary
    loadSummaryJSONP();
}

// Load summary using JSONP
function loadSummaryJSONP() {
    const callbackName = 'summaryCallback_' + Date.now();
    
    const script = document.createElement('script');
    script.src = `${CONFIG.API_URL}?action=getSummary&callback=${callbackName}`;
    
    window[callbackName] = function(data) {
        if (data) {
            updateSummaryDisplay(data);
        }
        
        delete window[callbackName];
        document.head.removeChild(script);
    };
    
    script.onerror = function() {
        delete window[callbackName];
        if (script.parentNode) {
            document.head.removeChild(script);
        }
    };
    
    document.head.appendChild(script);
}

// Process transactions from Google Sheets
function processRemoteTransactions(remoteTransactions) {
    if (!remoteTransactions || remoteTransactions.length === 0) {
        console.log('No transactions in Google Sheets');
        return;
    }
    
    // Convert remote transactions to our format
    const processedTransactions = remoteTransactions.map(t => ({
        id: t.id || ('remote_' + Date.now() + Math.random()),
        type: t.type || 'expense',
        name: t.name || 'Unknown',
        amount: parseFloat(t.amount) || 0,
        description: t.description || '',
        date: t.date || new Date().toISOString(),
        status: 'synced',
        source: 'remote'
    }));
    
    // Merge with local transactions
    // First, add all remote transactions
    const remoteIds = processedTransactions.map(t => t.id);
    transactions = transactions.filter(t => !remoteIds.includes(t.id));
    
    // Add processed transactions
    transactions = [...processedTransactions, ...transactions];
    
    // Save to local storage
    saveLocalData();
    
    // Update UI
    updateDashboard();
    displayTransactions();
    showNotification(`Loaded ${processedTransactions.length} transactions from Google Sheets`, 'success');
}

// Update summary display
function updateSummaryDisplay(summaryData) {
    if (!summaryData) return;
    
    const totalInc = summaryData.totalIncome || 0;
    const totalExp = summaryData.totalExpense || 0;
    const totalBal = summaryData.totalBalance || 0;
    
    totalIncome.textContent = `₹${totalInc.toFixed(2)}`;
    totalExpense.textContent = `₹${totalExp.toFixed(2)}`;
    totalBalance.textContent = `₹${totalBal.toFixed(2)}`;
    
    // Color code balance
    if (totalBal < 0) {
        totalBalance.style.color = '#e74c3c';
    } else if (totalBal > 0) {
        totalBalance.style.color = '#2ecc71';
    } else {
        totalBalance.style.color = '#2c3e50';
    }
}

// Sync a single transaction to Google Sheets
function syncSingleTransaction(transaction) {
    if (transaction.status === 'synced') return;
    
    console.log('🔄 Syncing transaction:', transaction.id);
    
    // Create form data
    const formData = new URLSearchParams();
    formData.append('type', transaction.type);
    formData.append('name', transaction.name);
    formData.append('amount', transaction.amount);
    formData.append('description', transaction.description);
    
    // Use iframe technique for POST
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.name = 'postFrame_' + transaction.id;
    
    const form = document.createElement('form');
    form.target = iframe.name;
    form.action = `${CONFIG.API_URL}?action=addTransaction`;
    form.method = 'POST';
    
    // Add form data
    formData.forEach((value, key) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
    });
    
    // Add to page and submit
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
    
    // Clean up after submission
    setTimeout(() => {
        document.body.removeChild(iframe);
        document.body.removeChild(form);
        
        // Update transaction status (assuming success)
        transaction.status = 'synced';
        saveLocalData();
        updateLocalStatus();
    }, 3000);
}

// Sync all pending transactions
function syncPendingTransactions() {
    const pending = pendingTransactions.filter(t => t.status === 'pending');
    
    if (pending.length === 0) {
        showNotification('No pending transactions to sync', 'info');
        return;
    }
    
    showNotification(`Syncing ${pending.length} transactions...`, 'info');
    
    // Sync each transaction with delay to avoid rate limiting
    pending.forEach((transaction, index) => {
        setTimeout(() => {
            syncSingleTransaction(transaction);
        }, index * 2000); // 2 seconds between each
    });
}

// Update dashboard with current data
function updateDashboard() {
    let totalIncomeAmount = 0;
    let totalExpenseAmount = 0;
    
    transactions.forEach(transaction => {
        if (transaction.type === 'income') {
            totalIncomeAmount += transaction.amount;
        } else if (transaction.type === 'expense') {
            totalExpenseAmount += transaction.amount;
        }
    });
    
    const totalBalanceAmount = totalIncomeAmount - totalExpenseAmount;
    
    // Update display
    totalIncome.textContent = `₹${totalIncomeAmount.toFixed(2)}`;
    totalExpense.textContent = `₹${totalExpenseAmount.toFixed(2)}`;
    totalBalance.textContent = `₹${totalBalanceAmount.toFixed(2)}`;
    
    // Color code balance
    if (totalBalanceAmount < 0) {
        totalBalance.style.color = '#e74c3c';
    } else if (totalBalanceAmount > 0) {
        totalBalance.style.color = '#2ecc71';
    } else {
        totalBalance.style.color = '#2c3e50';
    }
}

// Display transactions in UI
function displayTransactions() {
    if (!transactions || transactions.length === 0) {
        transactionList.innerHTML = '<p class="empty-message">No transactions yet. Add some!</p>';
        return;
    }
    
    let filteredTransactions = transactions;
    if (currentFilter !== 'all') {
        filteredTransactions = transactions.filter(t => t.type === currentFilter);
    }
    
    // Sort by date (newest first)
    filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Clear and rebuild list
    transactionList.innerHTML = '';
    
    filteredTransactions.forEach(transaction => {
        const transactionElement = document.createElement('div');
        transactionElement.className = `transaction-item ${transaction.type}`;
        
        const amountClass = transaction.type === 'income' ? 'income-amount' : 'expense-amount';
        const amountPrefix = transaction.type === 'income' ? '+' : '-';
        const statusIcon = transaction.status === 'pending' ? '⏳' : '✅';
        const sourceIcon = transaction.source === 'remote' ? '☁️' : '📱';
        
        transactionElement.innerHTML = `
            <div class="transaction-info">
                <h4>${transaction.name} <span class="status-icon">${statusIcon} ${sourceIcon}</span></h4>
                <p>${transaction.description || 'No description'}</p>
                <small>${formatDate(transaction.date)}</small>
            </div>
            <div class="transaction-amount ${amountClass}">
                ${amountPrefix}₹${transaction.amount.toFixed(2)}
            </div>
        `;
        
        transactionList.appendChild(transactionElement);
    });
}

// Format date
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateString;
    }
}

// Update connection status
function updateConnectionStatus(icon, text) {
    connectionIcon.textContent = icon;
    connectionText.textContent = text;
}

// Update local storage status
function updateLocalStatus() {
    const pendingCount = pendingTransactions.filter(t => t.status === 'pending').length;
    const totalCount = transactions.length;
    
    localStatus.textContent = `Local storage: ${totalCount} transactions (${pendingCount} pending sync)`;
    localStatus.style.color = pendingCount > 0 ? '#e67e22' : '#27ae60';
}

// Save data to local storage
function saveLocalData() {
    try {
        localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(transactions));
    } catch (error) {
        console.error('Error saving to local storage:', error);
    }
}

// Save pending transactions
function savePendingTransactions() {
    try {
        localStorage.setItem(CONFIG.PENDING_KEY, JSON.stringify(pendingTransactions));
    } catch (error) {
        console.error('Error saving pending transactions:', error);
    }
}

// Load data from local storage
function loadLocalData() {
    try {
        const saved = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
        const pending = localStorage.getItem(CONFIG.PENDING_KEY);
        
        if (saved) {
            transactions = JSON.parse(saved);
        }
        
        if (pending) {
            pendingTransactions = JSON.parse(pending);
        }
        
        console.log(`📱 Loaded ${transactions.length} transactions from local storage`);
        console.log(`⏳ ${pendingTransactions.filter(t => t.status === 'pending').length} pending sync`);
    } catch (error) {
        console.error('Error loading from local storage:', error);
        transactions = [];
        pendingTransactions = [];
    }
}

// Clear local data
function clearLocalData() {
    if (confirm('This will clear ALL local transactions. Continue?')) {
        transactions = [];
        pendingTransactions = [];
        localStorage.removeItem(CONFIG.LOCAL_STORAGE_KEY);
        localStorage.removeItem(CONFIG.PENDING_KEY);
        
        updateDashboard();
        displayTransactions();
        updateLocalStatus();
        
        showNotification('Local data cleared', 'success');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span class="notification-icon">${getNotificationIcon(type)}</span>
        <span class="notification-text">${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Get icon for notification type
function getNotificationIcon(type) {
    switch(type) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'info': return 'ℹ️';
        default: return '💡';
    }
}

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 10px;
        background: white;
        box-shadow: 0 5px 20px rgba(0,0,0,0.15);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease;
        border-left: 5px solid #3498db;
    }
    
    .notification.success {
        border-left-color: #2ecc71;
        background: #f0fff4;
    }
    
    .notification.error {
        border-left-color: #e74c3c;
        background: #fff0f0;
    }
    
    .notification.info {
        border-left-color: #3498db;
        background: #f0f8ff;
    }
    
    .notification-icon {
        font-size: 1.2em;
    }
    
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .connection-status {
        display: flex;
        align-items: center;
        gap: 10px;
        justify-content: center;
        margin-top: 10px;
        padding: 10px;
        background: #f8f9fa;
        border-radius: 8px;
        font-size: 0.9em;
    }
    
    .sync-section {
        background: #f8f9fa;
        padding: 20px;
        border-radius: 10px;
        margin: 20px 0;
        text-align: center;
    }
    
    .sync-controls {
        display: flex;
        gap: 10px;
        justify-content: center;
        margin: 15px 0;
        flex-wrap: wrap;
    }
    
    .sync-btn {
        padding: 10px 20px;
        background: #3498db;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.3s;
    }
    
    .sync-btn:hover {
        background: #2980b9;
    }
    
    .sync-btn.clear {
        background: #e74c3c;
    }
    
    .sync-btn.clear:hover {
        background: #c0392b;
    }
    
    .status-icon {
        font-size: 0.8em;
        opacity: 0.8;
        margin-left: 5px;
    }
    
    .api-info {
        font-size: 0.8em;
        color: #7f8c8d;
        margin-top: 5px;
        text-align: center;
    }
    
    .api-info code {
        background: #eaeaea;
        padding: 2px 5px;
        border-radius: 3px;
        font-family: monospace;
        word-break: break-all;
    }
`;
document.head.appendChild(style);
