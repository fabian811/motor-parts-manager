package com.example.myapplication

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Report
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.example.myapplication.ui.theme.MyApplicationTheme
import java.io.File
import java.io.FileOutputStream
import java.math.BigDecimal
import java.security.MessageDigest
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Currency
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        createNotificationChannel(this)
        setContent {
            MyApplicationTheme {
                MotorPartsApp()
            }
        }
    }
}

enum class AppTab(val label: String, val icon: ImageVector) {
    Dashboard("Dashboard", Icons.Default.Home),
    Inventory("Inventory", Icons.Default.Inventory),
    Sales("Sales", Icons.Default.ShoppingCart),
    Reports("Reports", Icons.Default.Report),
    Settings("Settings", Icons.Default.Settings)
}

data class ShopUser(
    val id: Long,
    val name: String,
    val shopName: String,
    val email: String,
    val phone: String,
    val passwordHash: String
)

data class Product(
    val id: Long,
    val internalProductId: String,
    val name: String,
    val partNumber: String,
    val brand: String,
    val compatibleModels: String,
    val category: String,
    val purchasePrice: Double,
    val sellingPrice: Double,
    val stockQuantity: Int,
    val minStock: Int,
    val supplier: String,
    val description: String,
    val dateAdded: String,
    val archived: Int,
    val imagePath: String?
)

data class Sale(
    val id: Long,
    val saleNumber: String,
    val timestamp: String,
    val customerName: String,
    val customerPhone: String,
    val discount: Double,
    val total: Double,
    val paymentMethod: String,
    val status: String
)

data class SaleItem(
    val id: Long,
    val saleId: Long,
    val productId: Long,
    val productName: String,
    val partNumber: String,
    val unitPrice: Double,
    val quantity: Int,
    val lineTotal: Double,
    val brand: String
)

data class NotificationItem(
    val id: Long,
    val title: String,
    val message: String,
    val category: String,
    val createdAt: String,
    val readStatus: Int,
    val targetType: String,
    val targetId: String
)

data class SalesSummary(
    val salesToday: Double,
    val transactionsToday: Int,
    val itemsSoldToday: Int,
    val productTypes: Int,
    val stockUnits: Int,
    val lowStockProducts: Int,
    val outOfStock: Int,
    val estimatedGrossProfit: Double
)

data class CartItem(
    val productId: Long,
    val quantity: Int,
    val productName: String,
    val productPartNumber: String,
    val unitPrice: Double,
    val stockQuantity: Int
)

@Composable
fun MotorPartsApp() {
    val context = LocalContext.current
    val db = remember(context) { MotorPartsDbHelper(context.applicationContext) }
    val prefs = remember(context) { SecurePreferencesHelper(context.applicationContext) }
    var currentUserState by remember { mutableStateOf<ShopUser?>(db.getCurrentUser(prefs)) }
    var registrationMode by remember { mutableStateOf(false) }

    val currentUser = currentUserState
    if (currentUser == null) {
        if (registrationMode) {
            RegistrationScreen(
                db = db,
                prefs = prefs,
                onBackToLogin = { registrationMode = false },
                onSuccess = { currentUserState = it }
            )
        } else {
            LoginScreen(
                db = db,
                prefs = prefs,
                onLoginSuccess = { currentUserState = it },
                onCreateAccount = { registrationMode = true },
                onOpenSupport = { openSupportEmail(context) }
            )
        }
        return
    }

    MainAppShell(
        db = db,
        preferences = prefs,
        currentUser = currentUser,
        onLogout = {
            db.clearCurrentUser(prefs)
            currentUserState = null
        }
    )
}

@Composable
fun LoginScreen(
    db: MotorPartsDbHelper,
    prefs: SecurePreferencesHelper,
    onLoginSuccess: (ShopUser) -> Unit,
    onCreateAccount: () -> Unit,
    onOpenSupport: () -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var rememberMe by remember { mutableStateOf(true) }
    var passwordVisible by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Settings,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(72.dp)
            )
            Spacer(Modifier.height(16.dp))
            Text("Motor Parts Manager", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text("Shop dashboard and billing", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email or username") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    TextButton(onClick = { passwordVisible = !passwordVisible }) {
                        Text(if (passwordVisible) "Hide" else "Show")
                    }
                }
            )
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(checked = rememberMe, onCheckedChange = { rememberMe = it })
                Text("Remember login")
            }
            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(error ?: "", color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    val login = db.login(email.trim(), password)
                    if (login == null) {
                        error = "Invalid login details"
                    } else {
                        error = null
                        db.saveCurrentUser(prefs, login.id, rememberMe)
                        onLoginSuccess(login)
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Login") }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onCreateAccount, modifier = Modifier.fillMaxWidth()) {
                Text("Create account")
            }
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onOpenSupport) { Text("Customer support") }
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { /* recovery flow */ }) { Text("Forgot password") }
        }
    }
}

@Composable
fun RegistrationScreen(
    db: MotorPartsDbHelper,
    prefs: SecurePreferencesHelper,
    onBackToLogin: () -> Unit,
    onSuccess: (ShopUser) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var shopName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var acceptedPolicy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.Top,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Create shop account", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(20.dp))
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Shopkeeper name") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = shopName, onValueChange = { shopName = it }, label = { Text("Shop name") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email address") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone number") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("Password") }, modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = confirmPassword, onValueChange = { confirmPassword = it }, label = { Text("Confirm password") }, modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation())
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = acceptedPolicy, onCheckedChange = { acceptedPolicy = it })
                Text("Accept privacy policy and terms")
            }
            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(error ?: "", color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    val result = db.registerUser(name, shopName, email, phone, password, confirmPassword, acceptedPolicy)
                    if (result == null) {
                        error = "Please complete every field and make sure the passwords match."
                    } else {
                        db.saveCurrentUser(prefs, result.id, true)
                        onSuccess(result)
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Create account") }
            Spacer(Modifier.height(12.dp))
            TextButton(onClick = onBackToLogin) { Text("Back to login") }
        }
    }
}

@Composable
fun MainAppShell(
    db: MotorPartsDbHelper,
    preferences: SecurePreferencesHelper,
    currentUser: ShopUser,
    onLogout: () -> Unit
) {
    var selectedTab by remember { mutableStateOf(AppTab.Dashboard) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                AppTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) }
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                AppTab.Dashboard -> DashboardScreen(db = db, currentUser = currentUser) {
                    selectedTab = AppTab.Sales
                }
                AppTab.Inventory -> InventoryScreen(db = db)
                AppTab.Sales -> SalesScreen(db = db)
                AppTab.Reports -> ReportsScreen(db = db)
                AppTab.Settings -> SettingsScreen(db = db, currentUser = currentUser, onLogout = onLogout)
            }
        }
    }
}

@Composable
fun DashboardScreen(
    db: MotorPartsDbHelper,
    currentUser: ShopUser,
    onOpenSales: () -> Unit
) {
    val summary = remember { db.getDashboardSummary() }
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Welcome, ${currentUser.name}", style = MaterialTheme.typography.headlineSmall)
        Text("${currentUser.shopName}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))
        LazyVerticalGrid(columns = GridCells.Fixed(2), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.weight(1f)) {
            item { StatCard(title = "Sales today", value = formatCurrency(summary.salesToday)) }
            item { StatCard(title = "Transactions", value = summary.transactionsToday.toString()) }
            item { StatCard(title = "Items sold", value = summary.itemsSoldToday.toString()) }
            item { StatCard(title = "Product types", value = summary.productTypes.toString()) }
            item { StatCard(title = "Units in stock", value = summary.stockUnits.toString()) }
            item { StatCard(title = "Low stock", value = summary.lowStockProducts.toString()) }
            item { StatCard(title = "Out of stock", value = summary.outOfStock.toString()) }
            item { StatCard(title = "Estimated profit", value = formatCurrency(summary.estimatedGrossProfit)) }
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(onClick = { onOpenSales() }, modifier = Modifier.weight(1f)) { Text("New sale") }
            OutlinedButton(onClick = { /* inventory */ }, modifier = Modifier.weight(1f)) { Text("Inventory") }
        }
    }
}

@Composable
fun StatCard(title: String, value: String) {
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(8.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun InventoryScreen(db: MotorPartsDbHelper) {
    var query by remember { mutableStateOf("") }
    val products = remember(query) { db.searchProducts(query) }
    var showDialog by remember { mutableStateOf(false) }
    var editingProduct by remember { mutableStateOf<Product?>(null) }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(16.dp)) {
            OutlinedTextField(value = query, onValueChange = { query = it }, label = { Text("Search products") }, leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(products) { product ->
                    ProductRow(
                        product = product,
                        onEdit = {
                            editingProduct = product
                            showDialog = true
                        },
                        onAddStock = {
                            db.addStock(product.id, 10, "Restock", "Inventory restock")
                        },
                        onRecordAdjustment = {
                            db.addStock(product.id, -1, "Adjustment", "Damaged item")
                        }
                    )
                }
            }
        }

        FloatingActionButton(
            onClick = {
                editingProduct = null
                showDialog = true
            },
            modifier = Modifier.align(Alignment.BottomEnd).padding(18.dp)
        ) {
            Icon(Icons.Default.Add, contentDescription = "Add product")
        }
    }

    if (showDialog) {
        ProductFormDialog(
            product = editingProduct,
            onDismiss = { showDialog = false },
            onSave = { newProduct ->
                if (editingProduct == null) {
                    db.addProduct(newProduct)
                } else {
                    db.updateProduct(newProduct)
                }
                showDialog = false
            }
        )
    }
}

@Composable
fun ProductRow(
    product: Product,
    onEdit: () -> Unit,
    onAddStock: () -> Unit,
    onRecordAdjustment: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(product.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${product.brand} • ${product.category} • ${product.partNumber}")
                }
                IconButton(onClick = onEdit) { Icon(Icons.Default.Edit, contentDescription = "Edit") }
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Stock: ${product.stockQuantity}")
                Text("Min: ${product.minStock}")
                Text("₹${product.sellingPrice}")
            }
            if (product.stockQuantity <= product.minStock) {
                Text("Low stock alert", color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onAddStock) { Text("Restock") }
                OutlinedButton(onClick = onRecordAdjustment) { Text("Adjust") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductFormDialog(
    product: Product?,
    onDismiss: () -> Unit,
    onSave: (Product) -> Unit
) {
    var name by remember(product) { mutableStateOf(product?.name ?: "") }
    var internalProductId by remember(product) { mutableStateOf(product?.internalProductId ?: "P-${System.currentTimeMillis()}") }
    var partNumber by remember(product) { mutableStateOf(product?.partNumber ?: "") }
    var brand by remember(product) { mutableStateOf(product?.brand ?: "") }
    var compatibleModels by remember(product) { mutableStateOf(product?.compatibleModels ?: "") }
    var category by remember(product) { mutableStateOf(product?.category ?: "General") }
    var purchasePrice by remember(product) { mutableStateOf(product?.purchasePrice?.toString() ?: "0") }
    var sellingPrice by remember(product) { mutableStateOf(product?.sellingPrice?.toString() ?: "0") }
    var stockQuantity by remember(product) { mutableStateOf((product?.stockQuantity ?: 0).toString()) }
    var minStock by remember(product) { mutableStateOf((product?.minStock ?: 5).toString()) }
    var supplier by remember(product) { mutableStateOf(product?.supplier ?: "") }
    var description by remember(product) { mutableStateOf(product?.description ?: "") }

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(20.dp), tonalElevation = 4.dp) {
            Column(modifier = Modifier.padding(20.dp).fillMaxWidth().verticalScroll(rememberScrollState())) {
                Text(if (product == null) "Add product" else "Edit product", style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Product name") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = internalProductId, onValueChange = { internalProductId = it }, label = { Text("Internal product ID") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = partNumber, onValueChange = { partNumber = it }, label = { Text("Part number") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = brand, onValueChange = { brand = it }, label = { Text("Brand") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = compatibleModels, onValueChange = { compatibleModels = it }, label = { Text("Compatible models") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = category, onValueChange = { category = it }, label = { Text("Category") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = purchasePrice, onValueChange = { purchasePrice = it }, label = { Text("Purchase price") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = sellingPrice, onValueChange = { sellingPrice = it }, label = { Text("Selling price") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = stockQuantity, onValueChange = { stockQuantity = it }, label = { Text("Stock quantity") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = minStock, onValueChange = { minStock = it }, label = { Text("Minimum stock") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = supplier, onValueChange = { supplier = it }, label = { Text("Supplier") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = {
                            val productToSave = Product(
                                id = product?.id ?: 0,
                                internalProductId = internalProductId,
                                name = name,
                                partNumber = partNumber,
                                brand = brand,
                                compatibleModels = compatibleModels,
                                category = category,
                                purchasePrice = purchasePrice.toDoubleOrNull() ?: 0.0,
                                sellingPrice = sellingPrice.toDoubleOrNull() ?: 0.0,
                                stockQuantity = stockQuantity.toIntOrNull() ?: 0,
                                minStock = minStock.toIntOrNull() ?: 0,
                                supplier = supplier,
                                description = description,
                                dateAdded = product?.dateAdded ?: System.currentTimeMillis().toString(),
                                archived = product?.archived ?: 0,
                                imagePath = product?.imagePath
                            )
                            onSave(productToSave)
                        }
                    ) { Text("Save") }
                }
            }
        }
    }
}

@Composable
fun SalesScreen(db: MotorPartsDbHelper) {
    var search by remember { mutableStateOf("") }
    val products = remember(search) { db.searchProducts(search) }
    var cart by remember { mutableStateOf(listOf<CartItem>()) }
    var customerName by remember { mutableStateOf("") }
    var customerPhone by remember { mutableStateOf("") }
    var discount by remember { mutableStateOf("0") }
    var paymentMethod by remember { mutableStateOf("Cash") }
    var error by remember { mutableStateOf<String?>(null) }

    val subtotal = cart.sumOf { it.quantity * it.unitPrice.toDouble() }
    val total = subtotal - (discount.toDoubleOrNull() ?: 0.0)

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Search product") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        if (products.isNotEmpty()) {
            LazyColumn(modifier = Modifier.height(180.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(products.take(5)) { product ->
                    Row(modifier = Modifier.fillMaxWidth().clickable {
                        val existing = cart.firstOrNull { it.productId == product.id }
                        if (existing == null) {
                            cart = cart + CartItem(product.id, 1, product.name, product.partNumber, product.sellingPrice, product.stockQuantity)
                        } else {
                            cart = cart.map {
                                if (it.productId == product.id) it.copy(quantity = it.quantity + 1) else it
                            }
                        }
                    }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text(product.name)
                            Text("${product.brand} • ${product.partNumber}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("₹${product.sellingPrice}")
                    }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Divider()
        Spacer(Modifier.height(12.dp))
        Text("Current bill", style = MaterialTheme.typography.titleMedium)
        if (cart.isEmpty()) {
            Text("No items yet")
        } else {
            cart.forEach { item ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text(item.productName)
                        Text("Qty: ${item.quantity}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("₹${item.quantity * item.unitPrice}")
                }
                Spacer(Modifier.height(8.dp))
            }
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(value = customerName, onValueChange = { customerName = it }, label = { Text("Customer name") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = customerPhone, onValueChange = { customerPhone = it }, label = { Text("Customer phone") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = discount, onValueChange = { discount = it }, label = { Text("Discount") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = paymentMethod, onValueChange = { paymentMethod = it }, label = { Text("Payment method") }, modifier = Modifier.fillMaxWidth())
        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(error ?: "", color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text("Subtotal")
            Text(formatCurrency(subtotal))
        }
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text("Discount")
            Text(formatCurrency(discount.toDoubleOrNull() ?: 0.0))
        }
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text("Total")
            Text(formatCurrency(total))
        }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                try {
                    val generatedSaleId = db.processSale(cart, customerName, customerPhone, paymentMethod, discount.toDoubleOrNull() ?: 0.0)
                    if (generatedSaleId != null) {
                        cart = emptyList()
                        customerName = ""
                        customerPhone = ""
                        discount = "0"
                        search = ""
                        error = null
                    } else {
                        error = "Sale could not be completed"
                    }
                } catch (e: IllegalStateException) {
                    error = e.message ?: "Inventory check failed"
                }
            },
            enabled = cart.isNotEmpty(),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Confirm sale") }
    }
}

@Composable
fun ReportsScreen(db: MotorPartsDbHelper) {
    var startDate by remember { mutableStateOf("2025-01-01") }
    var endDate by remember { mutableStateOf("2025-12-31") }
    var reportType by remember { mutableStateOf("Sales") }
    val context = LocalContext.current

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Reports", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(value = startDate, onValueChange = { startDate = it }, label = { Text("Start date") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = endDate, onValueChange = { endDate = it }, label = { Text("End date") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = reportType, onValueChange = { reportType = it }, label = { Text("Report type") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(16.dp))
        Button(onClick = {
            val file = db.generateReport(context, reportType, startDate, endDate)
            if (file != null) {
                openPdfFile(context, file)
            }
        }, modifier = Modifier.fillMaxWidth()) {
            Text("Generate PDF")
        }
    }
}

@Composable
fun SettingsScreen(
    db: MotorPartsDbHelper,
    currentUser: ShopUser,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    var showLogoutDialog by remember { mutableStateOf(false) }
    var notificationsEnabled by remember { mutableStateOf(true) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Account", style = MaterialTheme.typography.titleLarge)
        Card(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(currentUser.name)
                Text(currentUser.shopName)
                Text(currentUser.email)
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("Appearance", style = MaterialTheme.typography.titleLarge)
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Checkbox(checked = notificationsEnabled, onCheckedChange = { notificationsEnabled = it })
            Text("Enable low-stock notifications")
        }

        Spacer(Modifier.height(16.dp))
        Text("Customer support", style = MaterialTheme.typography.titleLarge)
        Button(onClick = { openSupportEmail(context) }, modifier = Modifier.fillMaxWidth()) {
            Text("Contact support")
        }

        Spacer(Modifier.height(16.dp))
        Text("Security & privacy", style = MaterialTheme.typography.titleLarge)
        Button(onClick = { /* data export / backup */ }, modifier = Modifier.fillMaxWidth()) {
            Text("Backup and restore")
        }

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { showLogoutDialog = true },
            modifier = Modifier.fillMaxWidth(),
            colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
        ) {
            Text("Logout")
        }
    }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Logout") },
            text = { Text("Are you sure you want to log out?") },
            confirmButton = {
                TextButton(onClick = {
                    onLogout()
                    showLogoutDialog = false
                }) { Text("Confirm") }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) { Text("Cancel") }
            }
        )
    }
}

class MotorPartsDbHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {
    companion object {
        const val DATABASE_NAME = "motor_parts_manager.db"
        const val DATABASE_VERSION = 1

        private fun hashPassword(password: String): String {
            val digest = MessageDigest.getInstance("SHA-256")
            val hash = digest.digest(password.toByteArray())
            return hash.joinToString("") { "%02x".format(it) }
        }

        private fun timestampNow(): String = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
        private fun todayAtStart(): String = SimpleDateFormat("yyyy-MM-dd 00:00:00", Locale.US).format(Date())
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, shop_name TEXT, email TEXT UNIQUE, phone TEXT, password_hash TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"
        )
        db.execSQL(
            "CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, internal_product_id TEXT UNIQUE, name TEXT, part_number TEXT, brand TEXT, compatible_models TEXT, category TEXT, purchase_price REAL, selling_price REAL, stock_quantity INTEGER, min_stock INTEGER, supplier TEXT, description TEXT, date_added TEXT, archived INTEGER DEFAULT 0, image_path TEXT)"
        )
        db.execSQL(
            "CREATE TABLE stock_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, movement_type TEXT, quantity INTEGER, reason TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, reference TEXT, unit_cost REAL)"
        )
        db.execSQL(
            "CREATE TABLE sales (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_number TEXT UNIQUE, sale_timestamp TEXT, customer_name TEXT, customer_phone TEXT, discount REAL, total REAL, payment_method TEXT, status TEXT DEFAULT 'completed')"
        )
        db.execSQL(
            "CREATE TABLE sale_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER, product_id INTEGER, product_name TEXT, part_number TEXT, unit_price REAL, quantity INTEGER, line_total REAL, brand TEXT)"
        )
        db.execSQL(
            "CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, message TEXT, category TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, read_status INTEGER DEFAULT 0, target_type TEXT, target_id TEXT)"
        )
        db.execSQL(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)"
        )
        seedDemoData(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS users")
        db.execSQL("DROP TABLE IF EXISTS products")
        db.execSQL("DROP TABLE IF EXISTS stock_movements")
        db.execSQL("DROP TABLE IF EXISTS sales")
        db.execSQL("DROP TABLE IF EXISTS sale_items")
        db.execSQL("DROP TABLE IF EXISTS notifications")
        db.execSQL("DROP TABLE IF EXISTS settings")
        onCreate(db)
    }

    fun seedDemoData(db: SQLiteDatabase) {
        val demoUser = hashPassword("admin123")
        db.execSQL(
            "INSERT INTO users (name, shop_name, email, phone, password_hash) VALUES ('Demo Operator', 'Raja Motor Zone', 'admin@motorparts.local', '9876543210', ?)",
            arrayOf(demoUser)
        )
        db.execSQL(
            "INSERT INTO products (internal_product_id, name, part_number, brand, compatible_models, category, purchase_price, selling_price, stock_quantity, min_stock, supplier, description, date_added, archived) VALUES ('P-1001', 'Brake Pad Set', 'BP-2001', 'Brembo', 'Apache RTR 160, Pulsar NS200', 'Brake', 580.0, 820.0, 22, 8, 'MotorLine', 'Front and rear replacement set', '${System.currentTimeMillis()}', 0)"
        )
        db.execSQL(
            "INSERT INTO products (internal_product_id, name, part_number, brand, compatible_models, category, purchase_price, selling_price, stock_quantity, min_stock, supplier, description, date_added, archived) VALUES ('P-1002', 'Engine Oil Filter', 'OF-540', 'MOTUL', 'Activa 6G, Scooty Pep', 'Engine', 210.0, 340.0, 6, 5, 'FastFix', 'Oil filter for scooter and commuter bikes', '${System.currentTimeMillis()}', 0)"
        )
        db.execSQL(
            "INSERT INTO products (internal_product_id, name, part_number, brand, compatible_models, category, purchase_price, selling_price, stock_quantity, min_stock, supplier, description, date_added, archived) VALUES ('P-1003', 'Chain Kit', 'CK-110', 'RK', 'CBR 150R, Dominar 400', 'Drive', 980.0, 1440.0, 0, 3, 'MotoHub', 'Chain and front sprocket set', '${System.currentTimeMillis()}', 0)"
        )
    }

    fun registerUser(
        name: String,
        shopName: String,
        email: String,
        phone: String,
        password: String,
        confirmPassword: String,
        acceptedPolicy: Boolean
    ): ShopUser? {
        if (name.isBlank() || shopName.isBlank() || email.isBlank() || phone.isBlank() || password.isBlank() || !acceptedPolicy || password != confirmPassword) {
            return null
        }
        val existing = readableDatabase.rawQuery("SELECT id FROM users WHERE email = ?", arrayOf(email.trim())).use { it.moveToFirst() }
        if (existing) return null
        val passwordHash = hashPassword(password)
        val insert = writableDatabase.insert(
            "users",
            null,
            android.content.ContentValues().apply {
                put("name", name.trim())
                put("shop_name", shopName.trim())
                put("email", email.trim())
                put("phone", phone.trim())
                put("password_hash", passwordHash)
            }
        )
        val userId = insert
        return readableDatabase.rawQuery(
            "SELECT id, name, shop_name, email, phone, password_hash FROM users WHERE id = ?",
            arrayOf(userId.toString())
        ).use { cursor ->
            if (!cursor.moveToFirst()) null else {
                ShopUser(
                    id = cursor.getLong(0),
                    name = cursor.getString(1),
                    shopName = cursor.getString(2),
                    email = cursor.getString(3),
                    phone = cursor.getString(4),
                    passwordHash = cursor.getString(5)
                )
            }
        }
    }

    fun login(emailOrUsername: String, password: String): ShopUser? {
        val query = readableDatabase.rawQuery(
            "SELECT id, name, shop_name, email, phone, password_hash FROM users WHERE email = ? OR name = ? LIMIT 1",
            arrayOf(emailOrUsername.trim(), emailOrUsername.trim())
        )
        return query.use { cursor ->
            if (!cursor.moveToFirst()) null else {
                val storedHash = cursor.getString(5)
                if (storedHash == hashPassword(password)) {
                    ShopUser(
                        id = cursor.getLong(0),
                        name = cursor.getString(1),
                        shopName = cursor.getString(2),
                        email = cursor.getString(3),
                        phone = cursor.getString(4),
                        passwordHash = cursor.getString(5)
                    )
                } else {
                    null
                }
            }
        }
    }

    fun getCurrentUser(prefs: SecurePreferencesHelper): ShopUser? {
        val userId = prefs.getCurrentUserId() ?: return null
        return readableDatabase.rawQuery(
            "SELECT id, name, shop_name, email, phone, password_hash FROM users WHERE id = ?",
            arrayOf(userId.toString())
        ).use { cursor ->
            if (!cursor.moveToFirst()) null else ShopUser(
                id = cursor.getLong(0),
                name = cursor.getString(1),
                shopName = cursor.getString(2),
                email = cursor.getString(3),
                phone = cursor.getString(4),
                passwordHash = cursor.getString(5)
            )
        }
    }

    fun saveCurrentUser(prefs: SecurePreferencesHelper, userId: Long, rememberMe: Boolean) {
        prefs.saveCurrentUserId(userId)
        prefs.setRememberMe(rememberMe)
    }

    fun clearCurrentUser(prefs: SecurePreferencesHelper) {
        prefs.clearCurrentUser()
    }

    fun addProduct(product: Product): Long {
        val values = android.content.ContentValues().apply {
            put("internal_product_id", product.internalProductId)
            put("name", product.name)
            put("part_number", product.partNumber)
            put("brand", product.brand)
            put("compatible_models", product.compatibleModels)
            put("category", product.category)
            put("purchase_price", product.purchasePrice)
            put("selling_price", product.sellingPrice)
            put("stock_quantity", product.stockQuantity)
            put("min_stock", product.minStock)
            put("supplier", product.supplier)
            put("description", product.description)
            put("date_added", product.dateAdded)
            put("archived", product.archived)
            put("image_path", product.imagePath)
        }
        val newId = writableDatabase.insert("products", null, values)
        if (product.stockQuantity > 0) {
            addStock(newId, product.stockQuantity, "Opening stock", "Initial stock")
        }
        return newId
    }

    fun updateProduct(product: Product): Int {
        return writableDatabase.update(
            "products",
            android.content.ContentValues().apply {
                put("internal_product_id", product.internalProductId)
                put("name", product.name)
                put("part_number", product.partNumber)
                put("brand", product.brand)
                put("compatible_models", product.compatibleModels)
                put("category", product.category)
                put("purchase_price", product.purchasePrice)
                put("selling_price", product.sellingPrice)
                put("stock_quantity", product.stockQuantity)
                put("min_stock", product.minStock)
                put("supplier", product.supplier)
                put("description", product.description)
                put("date_added", product.dateAdded)
                put("archived", product.archived)
                put("image_path", product.imagePath)
            },
            "id = ?",
            arrayOf(product.id.toString())
        )
    }

    fun searchProducts(query: String): List<Product> {
        val q = "%${query.trim()}%"
        val sql = if (query.isBlank()) {
            "SELECT id, internal_product_id, name, part_number, brand, compatible_models, category, purchase_price, selling_price, stock_quantity, min_stock, supplier, description, date_added, archived, image_path FROM products WHERE archived = 0 ORDER BY name"
        } else {
            "SELECT id, internal_product_id, name, part_number, brand, compatible_models, category, purchase_price, selling_price, stock_quantity, min_stock, supplier, description, date_added, archived, image_path FROM products WHERE archived = 0 AND (name LIKE ? OR part_number LIKE ? OR brand LIKE ? OR category LIKE ? OR compatible_models LIKE ?) ORDER BY name"
        }
        val args = if (query.isBlank()) emptyArray() else arrayOf(q, q, q, q, q)
        return readableDatabase.rawQuery(sql, args).use { cursor ->
            val list = mutableListOf<Product>()
            while (cursor.moveToNext()) {
                list.add(
                    Product(
                        id = cursor.getLong(0),
                        internalProductId = cursor.getString(1),
                        name = cursor.getString(2),
                        partNumber = cursor.getString(3),
                        brand = cursor.getString(4),
                        compatibleModels = cursor.getString(5),
                        category = cursor.getString(6),
                        purchasePrice = cursor.getDouble(7),
                        sellingPrice = cursor.getDouble(8),
                        stockQuantity = cursor.getInt(9),
                        minStock = cursor.getInt(10),
                        supplier = cursor.getString(11),
                        description = cursor.getString(12),
                        dateAdded = cursor.getString(13),
                        archived = cursor.getInt(14),
                        imagePath = cursor.getString(15)
                    )
                )
            }
            list
        }
    }

    fun addStock(productId: Long, quantity: Int, type: String, reason: String) {
        val product = readableDatabase.rawQuery("SELECT stock_quantity FROM products WHERE id = ?", arrayOf(productId.toString())).use { cursor ->
            if (!cursor.moveToFirst()) return
            cursor.getInt(0)
        }
        val newQty = (product + quantity).coerceAtLeast(0)
        writableDatabase.execSQL("UPDATE products SET stock_quantity = ? WHERE id = ?", arrayOf(newQty, productId))
        writableDatabase.insert(
            "stock_movements",
            null,
            android.content.ContentValues().apply {
                put("product_id", productId)
                put("movement_type", type)
                put("quantity", quantity)
                put("reason", reason)
                put("notes", "Manual adjustment")
                put("created_at", timestampNow())
            }
        )
    }

    fun processSale(
        cart: List<CartItem>,
        customerName: String,
        customerPhone: String,
        paymentMethod: String,
        discount: Double
    ): Long? {
        if (cart.isEmpty()) return null
        writableDatabase.beginTransaction()
        try {
            for (item in cart) {
                val product = readableDatabase.rawQuery("SELECT id, stock_quantity, name, part_number, selling_price FROM products WHERE id = ?", arrayOf(item.productId.toString())).use { cursor ->
                    if (!cursor.moveToFirst()) throw IllegalStateException("Product not found: ${item.productId}")
                    val stock = cursor.getInt(2)
                    if (stock < item.quantity) {
                        throw IllegalStateException("Not enough stock for ${item.productName}")
                    }
                    cursor
                }
            }

            val saleNumber = "SL-${System.currentTimeMillis()}"
            val total = cart.sumOf { it.quantity * it.unitPrice.toDouble() } - discount
            val saleId = writableDatabase.insert(
                "sales",
                null,
                android.content.ContentValues().apply {
                    put("sale_number", saleNumber)
                    put("sale_timestamp", timestampNow())
                    put("customer_name", customerName)
                    put("customer_phone", customerPhone)
                    put("discount", discount)
                    put("total", total)
                    put("payment_method", paymentMethod)
                    put("status", "completed")
                }
            )

            for (item in cart) {
                val lineTotal = item.quantity * item.unitPrice.toDouble()
                writableDatabase.insert(
                    "sale_items",
                    null,
                    android.content.ContentValues().apply {
                        put("sale_id", saleId)
                        put("product_id", item.productId)
                        put("product_name", item.productName)
                        put("part_number", item.productPartNumber)
                        put("unit_price", item.unitPrice)
                        put("quantity", item.quantity)
                        put("line_total", lineTotal)
                        put("brand", "")
                    }
                )
                val currentStock = readableDatabase.rawQuery("SELECT stock_quantity FROM products WHERE id = ?", arrayOf(item.productId.toString())).use { cursor ->
                    if (!cursor.moveToFirst()) throw IllegalStateException("Product not found")
                    cursor.getInt(0)
                }
                writableDatabase.execSQL("UPDATE products SET stock_quantity = ? WHERE id = ?", arrayOf((currentStock - item.quantity).coerceAtLeast(0), item.productId))
                writableDatabase.insert(
                    "stock_movements",
                    null,
                    android.content.ContentValues().apply {
                        put("product_id", item.productId)
                        put("movement_type", "sale")
                        put("quantity", -item.quantity)
                        put("reason", "Inventory sale")
                        put("notes", "Sale #$saleNumber")
                        put("created_at", timestampNow())
                    }
                )
            }
            writableDatabase.setTransactionSuccessful()
            return saleId
        } finally {
            writableDatabase.endTransaction()
        }
    }

    fun getDashboardSummary(): SalesSummary {
        val todayStart = todayAtStart()
        val todayEnd = timestampNow()
        val salesToday = readableDatabase.rawQuery("SELECT COALESCE(SUM(total),0) FROM sales WHERE sale_timestamp >= ? AND sale_timestamp <= ? AND status = 'completed'", arrayOf(todayStart, todayEnd)).use { cursor ->
            if (!cursor.moveToFirst()) 0.0 else cursor.getDouble(0)
        }
        val txCount = readableDatabase.rawQuery("SELECT COUNT(*) FROM sales WHERE sale_timestamp >= ? AND sale_timestamp <= ? AND status = 'completed'", arrayOf(todayStart, todayEnd)).use { cursor ->
            if (!cursor.moveToFirst()) 0 else cursor.getInt(0)
        }
        val itemsSold = readableDatabase.rawQuery("SELECT COALESCE(SUM(quantity),0) FROM sale_items INNER JOIN sales ON sales.id = sale_items.sale_id WHERE sales.sale_timestamp >= ? AND sales.sale_timestamp <= ? AND sales.status = 'completed'", arrayOf(todayStart, todayEnd)).use { cursor ->
            if (!cursor.moveToFirst()) 0 else cursor.getInt(0)
        }
        val productTypes = readableDatabase.rawQuery("SELECT COUNT(*) FROM products WHERE archived = 0", arrayOf()).use { cursor ->
            if (!cursor.moveToFirst()) 0 else cursor.getInt(0)
        }
        val stockUnits = readableDatabase.rawQuery("SELECT COALESCE(SUM(stock_quantity),0) FROM products WHERE archived = 0", arrayOf()).use { cursor ->
            if (!cursor.moveToFirst()) 0 else cursor.getInt(0)
        }
        val lowStock = readableDatabase.rawQuery("SELECT COUNT(*) FROM products WHERE archived = 0 AND stock_quantity <= min_stock AND stock_quantity > 0", arrayOf()).use { cursor ->
            if (!cursor.moveToFirst()) 0 else cursor.getInt(0)
        }
        val outOfStock = readableDatabase.rawQuery("SELECT COUNT(*) FROM products WHERE archived = 0 AND stock_quantity = 0", arrayOf()).use { cursor ->
            if (!cursor.moveToFirst()) 0 else cursor.getInt(0)
        }
        val estimatedGrossProfit = readableDatabase.rawQuery("SELECT COALESCE(SUM((si.unit_price - p.purchase_price) * si.quantity),0) FROM sale_items si INNER JOIN products p ON p.id = si.product_id INNER JOIN sales s ON s.id = si.sale_id WHERE s.sale_timestamp >= ? AND s.sale_timestamp <= ? AND s.status = 'completed'", arrayOf(todayStart, todayEnd)).use { cursor ->
            if (!cursor.moveToFirst()) 0.0 else cursor.getDouble(0)
        }
        return SalesSummary(salesToday, txCount, itemsSold, productTypes, stockUnits, lowStock, outOfStock, estimatedGrossProfit)
    }

    fun generateReport(context: Context, reportType: String, startDate: String, endDate: String): File? {
        val saleRows = mutableListOf<String>()
        val start = if (startDate.isBlank()) "2000-01-01" else startDate
        val end = if (endDate.isBlank()) "2100-12-31" else endDate
        val rows = readableDatabase.rawQuery(
            "SELECT sale_number, sale_timestamp, total, payment_method FROM sales WHERE sale_timestamp BETWEEN ? AND ? AND status='completed' ORDER BY sale_timestamp DESC",
            arrayOf(start, end)
        ).use { cursor ->
            while (cursor.moveToNext()) {
                saleRows.add("${cursor.getString(0)} | ${cursor.getString(1)} | ${formatCurrency(cursor.getDouble(2))} | ${cursor.getString(3)}")
            }
            saleRows
        }
        val file = File(context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), "motor_parts_${reportType.lowercase()}_${System.currentTimeMillis()}.pdf")
        val document = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = document.startPage(pageInfo)
        val canvas: Canvas = page.canvas
        val titlePaint = Paint().apply { color = Color.BLACK; textSize = 22f; isFakeBoldText = true }
        val bodyPaint = Paint().apply { color = Color.DKGRAY; textSize = 12f }
        var y = 60f
        canvas.drawText("Motor Parts Manager - ${reportType} Report", 40f, y, titlePaint)
        y += 24f
        canvas.drawText("Period: $start to $end", 40f, y, bodyPaint)
        y += 28f
        if (rows.isEmpty()) {
            canvas.drawText("No records found for the selected period.", 40f, y, bodyPaint)
        } else {
            rows.forEach { row ->
                if (y > 760f) {
                    document.finishPage(page)
                    val nextPage = document.startPage(pageInfo)
                    val nextCanvas = nextPage.canvas
                    nextCanvas.drawText("Motor Parts Manager - ${reportType} Report (continued)", 40f, 50f, titlePaint)
                    y = 80f
                }
                canvas.drawText(row, 40f, y, bodyPaint)
                y += 18f
            }
        }
        document.finishPage(page)
        val fos = FileOutputStream(file)
        document.writeTo(fos)
        document.close()
        fos.close()
        return file
    }

}

class SecurePreferencesHelper(context: Context) {
    private val prefs: android.content.SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "secure_motor_parts_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun getCurrentUserId(): Long? {
        val value = prefs.getString("current_user_id", null) ?: return null
        return value.toLongOrNull()
    }

    fun saveCurrentUserId(userId: Long) {
        prefs.edit().putString("current_user_id", userId.toString()).apply()
    }

    fun setRememberMe(value: Boolean) {
        prefs.edit().putBoolean("remember_me", value).apply()
    }

    fun clearCurrentUser() {
        prefs.edit().remove("current_user_id").apply()
    }
}

private fun formatCurrency(value: Double): String {
    val format = NumberFormat.getCurrencyInstance(Locale("en", "IN")).apply {
        currency = Currency.getInstance("INR")
    }
    return format.format(value)
}

private fun openSupportEmail(context: Context) {
    val intent = Intent(Intent.ACTION_SENDTO).apply {
        data = Uri.parse("mailto:[YOUR_SUPPORT_EMAIL@example.com]")
        putExtra(Intent.EXTRA_SUBJECT, "Motor Parts Manager support request")
        putExtra(Intent.EXTRA_TEXT, "App version: 1.0.0\nDevice: ${Build.MODEL}\n")
    }
    if (intent.resolveActivity(context.packageManager) != null) {
        context.startActivity(intent)
    } else {
        Toast.makeText(context, "No email app available on this device", Toast.LENGTH_SHORT).show()
    }
}

private fun createNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(
            "motor_parts_alerts",
            "Motor Parts alerts",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply { description = "Alerts for low stock and daily sales summaries" }
        val manager = context.getSystemService(NotificationManager::class.java)
        manager?.createNotificationChannel(channel)
    }
}

private fun openPdfFile(context: Context, file: File) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.provider", file)
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/pdf")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    try {
        context.startActivity(intent)
    } catch (e: Exception) {
        Toast.makeText(context, "Unable to open PDF file", Toast.LENGTH_SHORT).show()
    }
}

private fun timestampNow(): String = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())