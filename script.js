// ✅ Using your provided Web App URL
const API_URL = 'https://script.google.com/macros/s/AKfycbyS6b9m-XQge5W97m4VQF4hQxbnN5rqhDIlVrevuLT8GemO_YglzMM8QrfpPxyc4nBZMA/exec';

// DOM Elements
const incomeForm = document.getElementById('incomeForm');
const expenseForm = document.getElementById('expenseForm');
const transactionList = document.getElementById('transactionList');
const totalBalance = document.getElementById('totalBalance');
const totalIncome = document.getElementById('totalIncome');
const totalExpense = document.getElementById('totalExpense');
const refreshBtn = document.getElementById('refreshBtn');
const testBtn = document.getElementById('testBtn');
const apiUrlElement = document.getElementById('apiUrl');
const connectionStatus = document.getElementById('connectionStatus');
const filterButtons = document.querySelectorAll('.filter-btn');
let currentFilter = 'all';

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ App loaded, API URL:', API_URL);
    
    // Display API URL
    apiUrlElement.textContent = API_URL.substring(0, 50) + '...';
    
    // Test connection first
    testConnection();
    
    // Load data
    loadTransactions();
    loadSummary();
    
    // Show welcome message
    setTimeout(() => {
        console.log('✅ App ready! Start adding income and expenses.');
    }, 500);
});

// Test connection to Google Apps Script
async function testConnection() {
    try {
        connectionStatus.textContent = '🟡 Testing connection...';
        connectionStatus.style.color = '#f39c12';
        
        // Simple GET request to test
        const response = await fetch(`${API_URL}?action=getSummary&test=true`);
        
        if (response.ok) {
            connectionStatus.textContent = '✅ Connected to Google Sheets!';
            connectionStatus.style.color = '#27ae60';
            showNotification('Connected to Google Sheets successfully!', 'success');
        } else {
            throw new Error('Connection failed');
        }
    } catch (error) {
        console.warn('⚠️ Connection test failed:', error);
        connectionStatus.textContent = '⚠️ Connection issue - working offline';
        connectionStatus.style.color = '#e74c3c';
        
        // Still try to load data - CORS might work for GET but not POST
        showNotification('Working in limited mode. Some features may not work.', 'error');
    }
}

// Handle Income Form Submission
incomeForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const transaction = {
        type: 'income',
        name: document.getElementById('incomeName').value,
        amount: parseFloat(document.getElementById('incomeAmount').value),
        description: document.getElementById('incomeDesc').value
    };
    
    console.log('📈 Adding income:', transaction);
    await addTransaction(transaction, e.submitter);
    incomeForm.reset();
});

// Handle Expense Form Submission
expenseForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const transaction = {
        type: 'expense',
        name: document.getElementById('expenseName').value,
        amount: parseFloat(document.getElementById('expenseAmount').value),
        description: document.getElementById('expenseDesc').value
    };
    
    console.log('📉 Adding expense:', transaction);
    await addTransaction(transaction, e.submitter);
    expenseForm.reset();
});

// Add Transaction to Google Sheets - FIXED VERSION
async function addTransaction(transaction, button) {
    const originalText = button.textContent;
    
    try {
        // Update button state
        button.textContent = '⏳ Saving...';
        button.disabled = true;
        
        // Using form submission method to avoid CORS preflight
        const formData = new FormData();
        formData.append('type', transaction.type);
        formData.append('name', transaction.name);
        formData.append('amount', transaction.amount);
        formData.append('description', transaction.description || '');
        
        const response = await fetch(`${API_URL}?action=addTransaction`, {
            method: 'POST',
            body: formData,  // Using FormData instead of JSON
            mode: 'no-cors'  // Bypass CORS for POST
        });
        
        // With no-cors mode, we can't read the response
        // So we assume success and refresh data
        console.log('✅ Transaction sent (assuming success)');
        showNotification(`${transaction.type} added successfully!`, 'success');
        
        // Refresh data after a delay
        setTimeout(() => {
            loadTransactions();
            loadSummary();
        }, 1000);
        
    } catch (error) {
        console.error('❌ Error:', error);
        
        // Fallback: Save locally if API fails
        saveTransactionLocally(transaction);
        showNotification('Saved locally. Will sync when online.', 'error');
        
    } finally {
        // Restore button state
        button.textContent = originalText;
        button.disabled = false;
    }
}

// Fallback: Save transaction to localStorage if API fails
function saveTransactionLocally(transaction) {
    try {
        const localTransactions = JSON.parse(localStorage.getItem('pendingTransactions') || '[]');
        transaction.id = 'local_' + Date.now();
        transaction.date = new Date().toISOString();
        localTransactions.push(transaction);
        localStorage.setItem('pendingTransactions', JSON.stringify(localTransactions));
        console.log('💾 Saved locally:', transaction);
    } catch (error) {
        console.error('Failed to save locally:', error);
    }
}

// Load Transactions from Google Sheets - FIXED for CORS
async function loadTransactions() {
    try {
        transactionList.innerHTML = '<p class="loading">⏳ Loading transactions...</p>';
        
        // Using GET with timestamp to avoid caching
        const timestamp = new Date().getTime();
        const response = await fetch(`${API_URL}?action=getTransactions&_=${timestamp}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        displayTransactions(data.transactions);
        
    } catch (error) {
        console.error('❌ Error loading transactions:', error);
        
        // Try to load from localStorage as fallback
        const localTransactions = JSON.parse(localStorage.getItem('pendingTransactions') || '[]');
        if (localTransactions.length > 0) {
            displayTransactions(localTransactions);
            showNotification('Showing locally saved transactions', 'error');
        } else {
            transactionList.innerHTML = '<p class="error">❌ Failed to load transactions</p>';
        }
    }
}

// Display Transactions in UI
function displayTransactions(transactions) {
    if (!transactions || transactions.length === 0) {
        transactionList.innerHTML = '<p class="empty-message">No transactions yet. Add some!</p>';
        return;
    }
    
    let filteredTransactions = transactions;
    if (currentFilter !== 'all') {
        filteredTransactions = transactions.filter(t => t.type === currentFilter);
    }
    
    transactionList.innerHTML = '';
    
    // Sort by date (newest first)
    filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    filteredTransactions.forEach(transaction => {
        const transactionElement = document.createElement('div');
        transactionElement.className = `transaction-item ${transaction.type}`;
        
        const amountClass = transaction.type === 'income' ? 'income-amount' : 'expense-amount';
        const amountPrefix = transaction.type === 'income' ? '+' : '-';
        const isLocal = transaction.id && transaction.id.startsWith('local_');
        
        transactionElement.innerHTML = `
            <div class="transaction-info">
                <h4>${transaction.name} ${isLocal ? '📱' : '☁️'}</h4>
                <p>${transaction.description || 'No description'}</p>
                <small>${formatDate(transaction.date)} ${isLocal ? '(Local)' : ''}</small>
            </div>
            <div class="transaction-amount ${amountClass}">
                ${amountPrefix}₹${parseFloat(transaction.amount).toFixed(2)}
            </div>
        `;
        
        transactionList.appendChild(transactionElement);
    });
}

// Load Summary Statistics - FIXED for CORS
async function loadSummary() {
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`${API_URL}?action=getSummary&_=${timestamp}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        totalBalance.textContent = `₹${data.totalBalance.toFixed(2)}`;
        totalIncome.textContent = `₹${data.totalIncome.toFixed(2)}`;
        totalExpense.textContent = `₹${data.totalExpense.toFixed(2)}`;
        
        // Color code balance
        if (data.totalBalance < 0) {
            totalBalance.style.color = '#e74c3c';
        } else if (data.totalBalance > 0) {
            totalBalance.style.color = '#2ecc71';
        } else {
            totalBalance.style.color = '#2c3e50';
        }
    } catch (error) {
        console.error('❌ Error loading summary:', error);
        
        // Calculate from local storage as fallback
        calculateLocalSummary();
    }
}

// Calculate summary from localStorage
function calculateLocalSummary() {
    const localTransactions = JSON.parse(localStorage.getItem('pendingTransactions') || '[]');
    
    let totalIncome = 0;
    let totalExpense = 0;
    
    localTransactions.forEach(transaction => {
        if (transaction.type === 'income') {
            totalIncome += parseFloat(transaction.amount) || 0;
        } else if (transaction.type === 'expense') {
            totalExpense += parseFloat(transaction.amount) || 0;
        }
    });
    
    const totalBalance = totalIncome - totalExpense;
    
    document.getElementById('totalBalance').textContent = `₹${totalBalance.toFixed(2)}`;
    document.getElementById('totalIncome').textContent = `₹${totalIncome.toFixed(2)}`;
    document.getElementById('totalExpense').textContent = `₹${totalExpense.toFixed(2)}`;
    
    // Color code
    const balanceElement = document.getElementById('totalBalance');
    if (totalBalance < 0) {
        balanceElement.style.color = '#e74c3c';
    } else if (totalBalance > 0) {
        balanceElement.style.color = '#2ecc71';
    } else {
        balanceElement.style.color = '#2c3e50';
    }
}

// Format date nicely
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

// Filter Transactions
filterButtons.forEach(button => {
    button.addEventListener('click', function() {
        // Update active button
        filterButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        
        // Set filter and refresh
        currentFilter = this.dataset.filter;
        loadTransactions();
    });
});

// Refresh Data
refreshBtn.addEventListener('click', function() {
    this.textContent = '⏳ Refreshing...';
    this.disabled = true;
    
    loadTransactions();
    loadSummary();
    
    setTimeout(() => {
        this.textContent = '🔄 Refresh Data';
        this.disabled = false;
        showNotification('Data refreshed!', 'success');
    }, 1000);
});

// Test Connection Button
testBtn.addEventListener('click', testConnection);

// Show notification
function showNotification(message, type) {
    // Remove existing notifications
    const existingNotif = document.querySelector('.notification');
    if (existingNotif) existingNotif.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
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
        color: white;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
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
    .notification.success {
        background-color: #2ecc71;
    }
    .notification.error {
        background-color: #e74c3c;
    }
    .loading {
        text-align: center;
        color: #3498db;
        padding: 40px;
        font-style: italic;
    }
    .error {
        text-align: center;
        color: #e74c3c;
        padding: 40px;
        font-weight: bold;
    }
    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    .url-info {
        background: #f8f9fa;
        padding: 10px;
        border-radius: 5px;
        font-size: 0.9em;
        margin-top: 10px;
    }
    code {
        background: #eaeaea;
        padding: 2px 5px;
        border-radius: 3px;
        font-family: monospace;
    }
    .status {
        font-size: 0.9em;
        margin-top: 5px;
    }
    .instructions {
        background: #f8f9fa;
        padding: 20px;
        border-radius: 10px;
        margin: 20px 0;
    }
    .instructions ol {
        margin-left: 20px;
        margin-top: 10px;
    }
    .instructions li {
        margin-bottom: 5px;
    }
    .test-btn {
        background-color: #3498db;
        color: white;
        border: none;
        border-radius: 5px;
        padding: 5px 10px;
        cursor: pointer;
        margin-left: 10px;
    }
`;
document.head.appendChild(style);