import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, ShoppingCart, User as UserIcon, Search, 
  ChevronLeft, Plus, Minus, Trash2, Package, 
  MapPin, Store, Leaf, LogOut, Edit2, Check, 
  Banknote, Truck, MessageCircle, Send, Map,
  CreditCard, ShieldCheck
} from 'lucide-react';

// === FIREBASE IMPORTS ===
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, updateDoc, 
  deleteDoc, onSnapshot, getDoc, query, orderBy, addDoc
} from 'firebase/firestore';

// ==========================================
// 1. FIREBASE CONFIGURATION (WAJIB SAMA)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCIS1GZk6x89ITAIAaxaHxg_w00mcv2J-k",
  authDomain: "pakanku-app.firebaseapp.com",
  projectId: "pakanku-app",
  storageBucket: "pakanku-app.firebasestorage.app",
  messagingSenderId: "600847552162",
  appId: "1:600847552162:web:7c2e8b5c4612554ca291fb",
  measurementId: "G-EZMM4VZWD8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  // --- GLOBAL STATE ---
  const [user, setUser] = useState(null); 
  const [userProfile, setUserProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('home'); 
  const [activeView, setActiveView] = useState('auth'); 
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [toast, setToast] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // --- HELPERS ---
  const formatRp = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
  
  const navigateTo = (view, tab = activeTab) => {
    setActiveView(view);
    if (view === 'main') setActiveTab(tab);
  };

  // ==========================================
  // 2. AUTH & PERSISTENCE (FIX ANTI LOGOUT)
  // ==========================================
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (activeView === 'auth') setActiveView('main');
      } else {
        setUserProfile(null);
        setOrders([]);
        setCart([]);
        setActiveView('auth');
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [activeView]);

  // ==========================================
  // 3. DATA LISTENERS (ROOT COLLECTIONS)
  // ==========================================
  
  // REALTIME PRODUK (GLOBAL - Bisa dilihat tanpa login)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), (snap) => {
      const data = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(data);
    });
    return () => unsub();
  }, []);

  // PROFILE & ORDERS (Hanya jika user login)
  useEffect(() => {
    if (!user) return;
    
    // Listen to User Profile
    const unsubUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserProfile(data);
        if (activeView === 'main' && activeTab === 'home' && data.role === 'seller') {
            setActiveTab('dashboard');
        }
      }
    });

    // Listen to Orders (Filter secara lokal agar stabil tanpa Index rumit di Firestore)
    const unsubOrders = onSnapshot(collection(db, "orders"), (snap) => {
      const ords = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const myOrders = ords.filter(o => o.buyerId === user.uid || (o.sellerIds && o.sellerIds.includes(user.uid)));
      myOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setOrders(myOrders);
    });

    return () => { unsubUser(); unsubOrders(); };
  }, [user, activeView, activeTab]);

  // ==========================================
  // 4. CART FUNCTIONS
  // ==========================================
  const addToCart = (product) => {
    if (!user) {
      showToast('Silakan login untuk membeli!');
      navigateTo('auth');
      return;
    }
    if (product.stock <= 0) { showToast('Stok pakan habis!'); return; }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.qty + 1 > product.stock) { showToast('Batas maksimal stok tercapai!'); return prev; }
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    showToast('Masuk ke keranjang!');
  };

  const removeCartItem = (id) => setCart(prev => prev.filter(item => item.id !== id));
  const getCartTotal = () => cart.reduce((total, item) => total + (item.price * item.qty), 0);

  // ==========================================
  // 5. CHAT LOGIC
  // ==========================================
  const openChatWithSeller = async (sellerId, sellerName) => {
    if (!user) { navigateTo('auth'); return; }
    if (user.uid === sellerId) { showToast('Tidak bisa chat diri sendiri'); return; }

    const chatId = [user.uid, sellerId].sort().join('_'); // Buat ID unik konsisten
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    
    if (!chatSnap.exists()) {
      await setDoc(chatRef, {
        id: chatId,
        participants: [user.uid, sellerId],
        participantNames: { [user.uid]: userProfile.name, [sellerId]: sellerName },
        lastMessage: 'Memulai percakapan...',
        updatedAt: new Date().toISOString()
      });
    }
    
    setActiveChat({ id: chatId, partnerName: sellerName, partnerId: sellerId });
    navigateTo('chat');
  };

  // ==========================================
  // VIEWS COMPONENTS
  // ==========================================

  const AuthView = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'buyer' });
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');
      try {
        if (isLogin) {
          await signInWithEmailAndPassword(auth, formData.email, formData.password);
        } else {
          const res = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
          await setDoc(doc(db, "users", res.user.uid), {
            id: res.user.uid,
            name: formData.name,
            role: formData.role,
            email: formData.email,
            phone: '',
            address: '',
            mapLink: ''
          });
        }
      } catch (err) { setError(err.message.replace('Firebase:', '')); }
    };

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-[#4CAF50] to-[#388E3C] p-6 relative">
        <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm flex flex-col items-center relative z-10 border border-green-100">
          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
             <Leaf size={32} className="text-[#4CAF50]" />
          </div>
          <h1 className="text-4xl font-black text-[#5D4037] text-center tracking-tight">PAKANKU</h1>
          <p className="text-center text-[#4CAF50] text-[10px] font-black uppercase tracking-[0.3em] mt-1 mb-8">Created by : M. Raihan</p>
          
          {error && <p className="bg-red-50 text-red-500 p-3 rounded-xl text-xs mb-4 text-center font-bold w-full border border-red-100">{error}</p>}
          
          <form onSubmit={handleSubmit} className="space-y-4 w-full">
            {!isLogin && (
              <input placeholder="Nama Lengkap / Toko" required className="w-full p-4 rounded-xl bg-gray-50 border border-transparent focus:border-[#4CAF50] text-sm outline-none transition-colors" 
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            )}
            <input type="email" placeholder="Alamat Email" required className="w-full p-4 rounded-xl bg-gray-50 border border-transparent focus:border-[#4CAF50] text-sm outline-none transition-colors"
              value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            <input type="password" placeholder="Password (Min. 6 Karakter)" required minLength="6" className="w-full p-4 rounded-xl bg-gray-50 border border-transparent focus:border-[#4CAF50] text-sm outline-none transition-colors"
              value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
            
            {!isLogin && (
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={()=>setFormData({...formData, role:'buyer'})} className={`flex-1 p-3 rounded-xl text-xs font-black transition-all ${formData.role==='buyer'?'bg-[#4CAF50] text-white shadow-lg shadow-green-200':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>PEMBELI</button>
                <button type="button" onClick={()=>setFormData({...formData, role:'seller'})} className={`flex-1 p-3 rounded-xl text-xs font-black transition-all ${formData.role==='seller'?'bg-[#8D6E63] text-white shadow-lg shadow-orange-100':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>PENJUAL</button>
              </div>
            )}
            
            <button className="w-full bg-[#5D4037] text-white py-4 rounded-xl font-black shadow-xl shadow-orange-900/20 mt-4 active:scale-[0.98] transition-transform">
              {isLogin ? 'MASUK SEKARANG' : 'DAFTAR AKUN BARU'}
            </button>
          </form>
          
          <button onClick={() => {setIsLogin(!isLogin); setError('');}} className="w-full text-center text-xs mt-6 text-[#8D6E63] font-bold">
            {isLogin ? 'Belum punya akun? ' : 'Sudah punya akun? '}<span className="text-[#4CAF50]">Klik disini</span>
          </button>
        </div>
        
        <div className="absolute bottom-6 flex flex-col items-center">
           <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] shadow-sm">Created by: M. Raihan</p>
        </div>
      </div>
    );
  };

  const BuyerHome = () => (
    <div className="flex flex-col h-full bg-[#F8FAFC] pb-20">
      <div className="bg-white p-5 sticky top-0 z-20 shadow-sm flex items-center justify-between border-b border-gray-100">
        <div>
          <h2 className="text-[#4CAF50] font-black text-2xl tracking-tighter leading-none">PAKANKU</h2>
          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mt-1">Created by: M. Raihan</p>
        </div>
        <div className="bg-gray-100 rounded-full p-2 text-gray-500">
          <Search size={20} />
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 gap-4 overflow-y-auto">
        {/* Banner */}
        <div className="bg-gradient-to-r from-[#4CAF50] to-[#2E7D32] p-6 rounded-3xl text-white shadow-lg shadow-green-200 relative overflow-hidden">
          <div className="relative z-10">
            <span className="bg-white/20 px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest backdrop-blur-sm">PROMO HARI INI</span>
            <h3 className="font-black text-xl leading-tight mt-2 mb-1">Pakan Ternak<br/>Harga Pabrik!</h3>
            <p className="text-xs opacity-90 font-medium">Beli banyak lebih murah.</p>
          </div>
          <Package size={120} className="absolute -bottom-6 -right-6 opacity-10 rotate-12" />
        </div>

        <div className="flex items-center justify-between mt-2 px-1">
          <h3 className="font-black text-[#5D4037] text-lg">Eksplor Pakan</h3>
          <span className="text-xs font-bold text-[#4CAF50]">{products.length} Tersedia</span>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package size={48} className="mx-auto mb-3 opacity-20" />
            <p className="font-bold">Belum ada produk jualan</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map(p => (
              <div key={p.id} onClick={() => { setSelectedProduct(p); navigateTo('product'); }} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between active:scale-[0.98] transition-transform cursor-pointer">
                <div>
                   <div className="bg-green-50 rounded-2xl aspect-square flex items-center justify-center text-green-500 mb-3 shadow-inner">
                      <Package size={32} />
                   </div>
                   <h4 className="font-black text-[#5D4037] text-sm line-clamp-2 leading-snug">{p.name}</h4>
                   <p className="text-[#4CAF50] font-black text-lg mt-1">{formatRp(p.price)}</p>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-[10px] font-bold text-gray-400 px-2 py-1 bg-gray-50 rounded-lg border border-gray-100">Sisa: {p.stock}</span>
                  <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} className="bg-[#5D4037] text-white p-2 rounded-xl shadow-md active:scale-90 transition-transform">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const ProductDetail = () => {
    if (!selectedProduct) return null;
    const isOutOfStock = selectedProduct.stock <= 0;

    return (
      <div className="flex flex-col h-screen bg-white">
        <div className="p-4 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-20 border-b border-gray-50">
          <button onClick={() => navigateTo('main', 'home')} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200 transition-colors"><ChevronLeft /></button>
          <div className="text-center">
             <h2 className="font-black text-[#5D4037]">Detail Pakan</h2>
             <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Created by: M. Raihan</p>
          </div>
          <div className="w-10"></div>
        </div>
        
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="p-6 pb-0">
             <div className="bg-green-50 rounded-3xl w-full aspect-square flex flex-col items-center justify-center text-green-500 mb-6 shadow-inner relative overflow-hidden">
                <Package size={80} className="opacity-80" />
                {isOutOfStock && <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center"><span className="bg-red-500 text-white font-black px-4 py-2 rounded-xl uppercase tracking-widest shadow-lg">Habis Terjual</span></div>}
             </div>
          </div>
          
          <div className="px-6">
            <h1 className="text-2xl font-black text-[#5D4037] leading-tight mb-2">{selectedProduct.name}</h1>
            <p className="text-3xl font-black text-[#4CAF50] mb-6">{formatRp(selectedProduct.price)}</p>
            
            <div className="bg-gray-50 p-4 rounded-3xl mb-6 flex items-center justify-between border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-[#8D6E63] shadow-sm border border-gray-100"><Store size={20}/></div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Toko Penjual</p>
                  <p className="font-black text-[#5D4037]">{selectedProduct.sellerName}</p>
                </div>
              </div>
              <button onClick={() => openChatWithSeller(selectedProduct.sellerId, selectedProduct.sellerName)} className="bg-white text-[#4CAF50] p-3 rounded-2xl shadow-sm border border-gray-100 active:scale-95 transition-transform">
                <MessageCircle size={20} />
              </button>
            </div>

            <div className="space-y-4">
               <div>
                  <h3 className="font-black text-[#5D4037] mb-2 text-sm uppercase tracking-widest">Informasi Pakan</h3>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                     <p className="text-gray-600 text-sm leading-relaxed">{selectedProduct.desc}</p>
                  </div>
               </div>
               
               <div className="flex items-center justify-between bg-orange-50 p-4 rounded-2xl border border-orange-100">
                  <span className="font-black text-[#8D6E63] text-sm">Stok Tersedia</span>
                  <span className="font-black text-[#5D4037] bg-white px-3 py-1 rounded-lg shadow-sm">{selectedProduct.stock} Karung/Sak</span>
               </div>
               <div className="flex items-center justify-between bg-green-50 p-4 rounded-2xl border border-green-100">
                  <span className="font-black text-[#4CAF50] text-sm">Terjual</span>
                  <span className="font-black text-[#2E7D32] bg-white px-3 py-1 rounded-lg shadow-sm">{selectedProduct.sold || 0} Terjual</span>
               </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white border-t border-gray-100 flex gap-3 fixed bottom-0 w-full max-w-md shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-6 z-30">
          <button disabled={isOutOfStock} onClick={() => addToCart(selectedProduct)} className="flex-1 py-4 rounded-2xl font-black bg-green-50 text-[#4CAF50] flex items-center justify-center gap-2 border border-green-100 active:scale-95 transition-transform disabled:opacity-50">
            <ShoppingCart size={20}/>
          </button>
          <button disabled={isOutOfStock} onClick={() => { addToCart(selectedProduct); if(!isOutOfStock) navigateTo('main', 'cart'); }} className="flex-[2] py-4 rounded-2xl font-black bg-[#5D4037] text-white shadow-lg active:scale-95 transition-transform disabled:opacity-50 uppercase tracking-widest">
            Beli Langsung
          </button>
        </div>
      </div>
    );
  };

  const CartView = () => (
    <div className="flex flex-col h-full bg-[#F8FAFC] pb-20">
      <div className="bg-white p-5 sticky top-0 z-10 shadow-sm border-b border-gray-100 text-center">
         <h2 className="font-black text-[#5D4037] text-lg uppercase tracking-widest">Keranjang</h2>
         <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Created by: M. Raihan</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40 text-gray-400">
             <ShoppingCart size={64} className="mb-4" />
             <p className="font-black uppercase tracking-widest">Keranjang Masih Kosong</p>
          </div>
        ) : cart.map(item => (
          <div key={item.id} className="bg-white p-4 rounded-3xl flex items-center gap-4 shadow-sm border border-gray-100">
            <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center text-green-500 border border-green-100">
               <Package size={24} />
            </div>
            <div className="flex-1">
              <h4 className="font-black text-[#5D4037] text-sm line-clamp-2 leading-tight">{item.name}</h4>
              <p className="text-[#4CAF50] font-black mt-1">{formatRp(item.price)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button onClick={() => removeCartItem(item.id)} className="text-red-400 bg-red-50 p-2 rounded-xl active:scale-90 transition-transform"><Trash2 size={16}/></button>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-1 border border-gray-100">
                 <span className="font-black text-xs w-6 text-center text-[#5D4037]">{item.qty}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {cart.length > 0 && (
        <div className="p-5 bg-white border-t border-gray-100 fixed bottom-16 w-full max-w-md flex flex-col gap-4 rounded-t-[40px] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">
          <div className="flex justify-between items-center px-2">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Total Belanja</p>
            <p className="text-2xl font-black text-[#4CAF50]">{formatRp(getCartTotal())}</p>
          </div>
          <button onClick={() => navigateTo('checkout')} className="w-full bg-[#5D4037] text-white py-4 rounded-2xl font-black shadow-lg active:scale-[0.98] transition-transform uppercase tracking-widest">
            Lanjut Checkout
          </button>
        </div>
      )}
    </div>
  );

  const CheckoutView = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [method, setMethod] = useState('COD'); // COD or Transfer
    const [bank, setBank] = useState('BCA');
    
    const handleConfirmCheckout = async () => {
      // Validasi Alamat Lengkap
      if (!userProfile?.address || !userProfile?.phone || !userProfile?.name) {
        showToast('Lengkapi Data Diri & Alamat Pengiriman di Profil!');
        navigateTo('main', 'profile');
        return;
      }

      setIsProcessing(true);
      try {
        const orderId = `ORD-${Date.now().toString().slice(-6)}`;
        
        // 1. Kurangi Stok Produk di Koleksi `products`
        for (const item of cart) {
          const prodRef = doc(db, 'products', item.id);
          await updateDoc(prodRef, {
            stock: item.stock - item.qty,
            sold: (item.sold || 0) + item.qty
          });
        }

        // 2. Simpan Order ke Koleksi `orders`
        await setDoc(doc(db, "orders", orderId), {
          id: orderId,
          buyerId: user.uid,
          buyerName: userProfile.name,
          address: userProfile.address,
          phone: userProfile.phone,
          mapLink: userProfile.mapLink || '',
          items: cart,
          total: getCartTotal(),
          paymentMethod: method,
          bankInfo: method === 'Transfer Bank' ? bank : null,
          status: 'Dikemas', // Status flow: Dikemas -> Dikirim -> Sampai
          createdAt: new Date().toISOString(),
          sellerIds: [...new Set(cart.map(c => c.sellerId))]
        });

        setCart([]);
        showToast('Pesanan berhasil dibuat!');
        navigateTo('main', 'orders');
      } catch (e) { showToast('Error checkout: ' + e.message); }
      setIsProcessing(false);
    };

    return (
      <div className="flex flex-col h-screen bg-[#F8FAFC]">
        <div className="p-5 flex items-center gap-4 bg-white border-b border-gray-100 shadow-sm sticky top-0 z-20">
          <button onClick={() => navigateTo('main', 'cart')} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"><ChevronLeft size={20}/></button>
          <div>
            <h2 className="font-black text-[#5D4037] uppercase tracking-widest text-sm">Checkout Pakan</h2>
            <p className="text-[8px] font-black text-[#4CAF50] uppercase tracking-widest mt-0.5">Created by: M. Raihan</p>
          </div>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto space-y-4 pb-32">
          {/* ALAMAT */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4 border-b border-gray-50 pb-3">
               <h3 className="font-black text-sm flex items-center gap-2 text-[#4CAF50] uppercase tracking-widest"><MapPin size={18}/> Tujuan Pengiriman</h3>
               <button onClick={()=>navigateTo('main','profile')} className="text-[10px] font-black bg-gray-100 px-3 py-1.5 rounded-lg uppercase text-gray-500">Ubah</button>
            </div>
            
            {!userProfile?.address ? (
               <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-center">
                  <p className="text-xs font-black text-red-500 uppercase tracking-widest mb-2">Alamat Belum Diisi!</p>
                  <p className="text-[10px] text-red-400">Pesanan tidak dapat diproses tanpa alamat yang jelas.</p>
               </div>
            ) : (
               <div className="space-y-1">
                  <p className="text-sm font-black text-[#5D4037]">{userProfile?.name} <span className="text-xs text-gray-400 font-bold bg-gray-50 px-2 py-0.5 rounded-md ml-2">{userProfile?.phone}</span></p>
                  <p className="text-xs text-gray-500 font-medium leading-relaxed mt-2 p-3 bg-gray-50 rounded-xl">{userProfile?.address}</p>
                  {userProfile?.mapLink && <a href={userProfile.mapLink} target="_blank" rel="noreferrer" className="text-[10px] font-black text-blue-500 flex items-center gap-1 mt-2"><Map size={12}/> Buka di Google Maps</a>}
               </div>
            )}
          </div>

          {/* METODE PEMBAYARAN */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <h3 className="font-black text-sm mb-4 flex items-center gap-2 text-[#4CAF50] uppercase tracking-widest border-b border-gray-50 pb-3"><CreditCard size={18}/> Metode Pembayaran</h3>
            <div className="space-y-3">
               <label className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${method === 'COD' ? 'border-[#4CAF50] bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                  <input type="radio" name="payment" checked={method === 'COD'} onChange={()=>setMethod('COD')} className="hidden" />
                  <Truck size={24} className={method==='COD'?'text-[#4CAF50]':'text-gray-400'} />
                  <div>
                     <p className={`font-black text-sm ${method==='COD'?'text-[#4CAF50]':'text-gray-500'}`}>Bayar di Tempat (COD)</p>
                     <p className="text-[10px] font-bold text-gray-400">Bayar saat pakan sampai</p>
                  </div>
               </label>
               
               <label className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${method === 'Transfer Bank' ? 'border-[#5D4037] bg-orange-50' : 'border-gray-100 bg-gray-50'}`}>
                  <input type="radio" name="payment" checked={method === 'Transfer Bank'} onChange={()=>setMethod('Transfer Bank')} className="hidden" />
                  <Banknote size={24} className={method==='Transfer Bank'?'text-[#5D4037]':'text-gray-400'} />
                  <div>
                     <p className={`font-black text-sm ${method==='Transfer Bank'?'text-[#5D4037]':'text-gray-500'}`}>Transfer Bank</p>
                     <p className="text-[10px] font-bold text-gray-400">Verifikasi otomatis</p>
                  </div>
               </label>

               {method === 'Transfer Bank' && (
                  <div className="mt-4 p-4 bg-white border border-gray-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Pilih Bank Tujuan</p>
                     <div className="grid grid-cols-2 gap-2 mb-4">
                        {['BCA', 'BRI', 'Mandiri', 'BNI'].map(b => (
                           <button key={b} onClick={()=>setBank(b)} className={`py-2 px-3 rounded-xl text-xs font-black border transition-colors ${bank===b ? 'bg-[#5D4037] text-white border-[#5D4037]' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>{b}</button>
                        ))}
                     </div>
                     <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                        <p className="text-[10px] font-bold text-gray-500 uppercase">Rekening {bank} Seller</p>
                        <p className="font-black text-[#5D4037] text-lg tracking-widest my-1">{Math.floor(Math.random() * 9000000000) + 1000000000}</p>
                        <p className="text-[10px] font-bold text-gray-400">a/n Toko Pakan Ternak</p>
                     </div>
                  </div>
               )}
            </div>
          </div>

          {/* RINGKASAN */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <h3 className="font-black text-sm mb-4 flex items-center gap-2 text-[#4CAF50] uppercase tracking-widest border-b border-gray-50 pb-3"><Package size={18}/> Ringkasan Pakan</h3>
            <div className="space-y-3">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                     <span className="bg-gray-50 text-[#5D4037] font-black text-[10px] px-2 py-1 rounded-lg border border-gray-100">{item.qty}x</span>
                     <span className="font-bold text-gray-600 line-clamp-1">{item.name}</span>
                  </div>
                  <span className="font-black text-[#5D4037]">{formatRp(item.price * item.qty)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-5 bg-white border-t border-gray-100 fixed bottom-0 w-full max-w-md shadow-[0_-10px_40px_rgba(0,0,0,0.05)] flex flex-col gap-3 rounded-t-[40px] z-30">
           <div className="flex justify-between items-center px-2">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Total Pembayaran</span>
              <span className="text-2xl font-black text-[#4CAF50]">{formatRp(getCartTotal())}</span>
           </div>
          <button disabled={isProcessing || !userProfile?.address} onClick={handleConfirmCheckout} className="w-full bg-[#4CAF50] text-white py-4 rounded-2xl font-black shadow-lg active:scale-[0.98] transition-transform uppercase tracking-widest disabled:opacity-50 disabled:bg-gray-300">
            {isProcessing ? 'MEMPROSES PESANAN...' : 'KONFIRMASI PESANAN'}
          </button>
        </div>
      </div>
    );
  };

  const OrdersView = () => {
    const isSeller = userProfile?.role === 'seller';
    
    // Status update logic
    const updateOrderStatus = async (orderId, newStatus) => {
       try {
          await updateDoc(doc(db, "orders", orderId), { status: newStatus });
          showToast(`Status diperbarui ke: ${newStatus}`);
       } catch(e) { showToast('Gagal update status'); }
    };

    return (
      <div className="flex flex-col h-full bg-[#F8FAFC] pb-20">
        <div className="bg-white p-5 sticky top-0 z-10 shadow-sm border-b border-gray-100 text-center">
         <h2 className="font-black text-[#5D4037] text-lg uppercase tracking-widest">{isSeller ? 'Pesanan Masuk' : 'Riwayat Belanja'}</h2>
         <p className="text-[8px] font-black text-[#4CAF50] uppercase tracking-widest mt-1">Created by: M. Raihan</p>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          {orders.length === 0 ? (
             <div className="py-20 flex flex-col items-center opacity-30 text-gray-400">
                <Package size={64} className="mb-4"/>
                <p className="font-black uppercase tracking-widest">Belum Ada Transaksi</p>
             </div>
          ) : 
           orders.map(o => (
             <div key={o.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
               <div className="flex justify-between border-b border-gray-50 pb-4 mb-4 items-center">
                 <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><ShieldCheck size={12}/> Order ID</span>
                    <span className="text-xs font-black text-[#5D4037]">{o.id}</span>
                 </div>
                 <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl uppercase tracking-widest border ${
                    o.status === 'Sampai' ? 'bg-green-50 text-green-600 border-green-100' : 
                    o.status === 'Dikirim' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                    'bg-orange-50 text-orange-600 border-orange-100'
                 }`}>{o.status}</span>
               </div>
               
               {isSeller && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pembeli: {o.buyerName}</p>
                     <p className="text-xs font-bold text-[#5D4037]">{o.address}</p>
                     <p className="text-[10px] font-bold text-blue-500 mt-1">{o.phone}</p>
                  </div>
               )}

               <div className="space-y-2 mb-4">
                  {o.items.map((item, idx) => (
                    <p key={idx} className="text-sm font-bold text-gray-600 flex items-center gap-3">
                      <span className="w-6 h-6 bg-green-50 text-[#4CAF50] rounded-lg text-[10px] flex items-center justify-center font-black">{item.qty}x</span>
                      {item.name}
                    </p>
                  ))}
               </div>
               
               <div className="bg-gray-50 p-3 rounded-xl flex justify-between items-center mb-4 border border-gray-100">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Metode: {o.paymentMethod}</span>
                  <span className="font-black text-[#4CAF50] text-lg">{formatRp(o.total)}</span>
               </div>

               {/* AKSI UPDATE STATUS */}
               <div className="flex gap-2">
                 {isSeller && o.status === 'Dikemas' && (
                    <button onClick={()=>updateOrderStatus(o.id, 'Dikirim')} className="flex-1 bg-[#5D4037] text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-transform shadow-md">Kirim Pesanan</button>
                 )}
                 {!isSeller && o.status === 'Dikirim' && (
                    <button onClick={()=>updateOrderStatus(o.id, 'Sampai')} className="flex-1 bg-[#4CAF50] text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-transform shadow-md">Pesanan Diterima</button>
                 )}
               </div>
             </div>
           ))}
        </div>
      </div>
    );
  };

  const SellerDashboard = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [form, setForm] = useState({ name: '', price: '', stock: '', desc: '' });
    const myProducts = products.filter(p => p.sellerId === user.uid);

    const saveProduct = async (e) => {
      e.preventDefault();
      try {
        const ref = doc(collection(db, "products"));
        await setDoc(ref, {
          name: form.name,
          price: Number(form.price),
          stock: Number(form.stock),
          desc: form.desc,
          sellerId: user.uid,
          sellerName: userProfile.name,
          sold: 0,
          createdAt: new Date().toISOString()
        });
        setIsAdding(false);
        setForm({ name: '', price: '', stock: '', desc: '' });
        showToast('Pakan berhasil ditambahkan ke toko!');
      } catch (e) { showToast(e.message); }
    };

    if (isAdding) return (
      <div className="p-6 bg-[#F8FAFC] h-full overflow-y-auto pb-24">
        <button onClick={()=>setIsAdding(false)} className="bg-white p-3 rounded-2xl mb-6 shadow-sm border border-gray-100 active:scale-90 transition-transform"><ChevronLeft/></button>
        <h2 className="text-2xl font-black text-[#5D4037] mb-1">Tambah Pakan</h2>
        <p className="text-[10px] font-black text-[#4CAF50] uppercase tracking-widest mb-6">Toko: {userProfile?.name}</p>
        
        <form onSubmit={saveProduct} className="space-y-5 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nama Pakan</label>
            <input placeholder="Contoh: Pakan Ayam Petelur" required className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 focus:border-[#4CAF50] focus:bg-white outline-none transition-all text-sm font-bold text-[#5D4037]" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Harga (Rp)</label>
              <input type="number" placeholder="50000" required className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 focus:border-[#4CAF50] focus:bg-white outline-none transition-all text-sm font-bold text-[#5D4037]" value={form.price} onChange={e=>setForm({...form, price:e.target.value})} />
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Stok Pakan</label>
              <input type="number" placeholder="10" required className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 focus:border-[#4CAF50] focus:bg-white outline-none transition-all text-sm font-bold text-[#5D4037]" value={form.stock} onChange={e=>setForm({...form, stock:e.target.value})} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Deskripsi Pakan</label>
            <textarea placeholder="Jelaskan nutrisi & keunggulan..." required rows="4" className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 focus:border-[#4CAF50] focus:bg-white outline-none transition-all text-sm font-bold text-[#5D4037]" value={form.desc} onChange={e=>setForm({...form, desc:e.target.value})} />
          </div>
          <button className="w-full bg-[#5D4037] text-white py-4 rounded-2xl font-black shadow-lg shadow-orange-900/10 active:scale-95 transition-transform uppercase tracking-widest mt-2">Posting ke Toko</button>
        </form>
      </div>
    );

    return (
      <div className="flex flex-col h-full bg-[#F8FAFC] pb-20">
        <div className="bg-white p-5 sticky top-0 z-10 shadow-sm border-b border-gray-100 flex justify-between items-center">
          <div>
             <h2 className="font-black text-[#5D4037] text-lg uppercase tracking-widest">Toko Pakan</h2>
             <p className="text-[8px] font-black text-[#4CAF50] uppercase tracking-widest mt-1">Created by: M. Raihan</p>
          </div>
          <button onClick={()=>setIsAdding(true)} className="bg-[#4CAF50] text-white p-3 rounded-2xl shadow-lg shadow-green-200 active:scale-90 transition-transform"><Plus size={20}/></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          {myProducts.length === 0 ? (
            <div className="py-20 flex flex-col items-center opacity-30 text-gray-400">
               <Store size={64} className="mb-4" />
               <p className="font-black uppercase tracking-widest">Belum Ada Produk</p>
            </div>
          ) : myProducts.map(p => (
            <div key={p.id} className="bg-white p-5 rounded-3xl flex flex-col gap-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 border border-orange-100 shadow-inner">
                   <Package size={28} />
                </div>
                <div className="flex-1">
                  <h4 className="font-black text-[#5D4037] text-sm line-clamp-2 leading-tight">{p.name}</h4>
                  <p className="text-[#4CAF50] font-black text-lg mt-1">{formatRp(p.price)}</p>
                </div>
              </div>
              <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                 <div className="flex gap-4">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Stok: <span className="text-[#5D4037]">{p.stock}</span></span>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Terjual: <span className="text-[#4CAF50]">{p.sold || 0}</span></span>
                 </div>
                 <button onClick={async ()=>{if(confirm('Hapus produk ini?')) await deleteDoc(doc(db, "products", p.id))}} className="text-red-400 bg-red-50 p-2 rounded-lg active:scale-90 transition-transform"><Trash2 size={16}/></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const ChatView = () => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const scrollRef = useRef(null);

    // FETCH MESSAGES REALTIME
    useEffect(() => {
      if (!activeChat) return;
      const msgRef = collection(db, "chats", activeChat.id, "messages");
      const q = query(msgRef, orderBy('createdAt', 'asc'));
      const unsub = onSnapshot(q, (snap) => {
        setMessages(snap.docs.map(doc => doc.data()));
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      });
      return () => unsub();
    }, [activeChat]);

    const sendMessage = async (e) => {
      e.preventDefault();
      if (!newMessage.trim()) return;
      const msg = newMessage;
      setNewMessage('');
      
      const chatRef = doc(db, "chats", activeChat.id);
      const msgCol = collection(db, "chats", activeChat.id, "messages");
      
      const now = new Date().toISOString();
      await addDoc(msgCol, {
        senderId: user.uid,
        text: msg,
        createdAt: now
      });
      
      await updateDoc(chatRef, {
        lastMessage: msg,
        updatedAt: now
      });
    };

    return (
      <div className="flex flex-col h-screen bg-[#F8FAFC]">
        <div className="p-4 flex items-center gap-4 bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
          <button onClick={() => navigateTo('main', 'home')} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"><ChevronLeft size={20}/></button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-[#4CAF50] font-black border border-green-100 shadow-inner">
               {activeChat?.partnerName?.charAt(0)}
            </div>
            <div>
              <h3 className="font-black text-sm text-[#5D4037]">{activeChat?.partnerName}</h3>
              <p className="text-[8px] text-[#4CAF50] font-black uppercase tracking-widest flex items-center gap-1"><span className="w-1.5 h-1.5 bg-[#4CAF50] rounded-full animate-pulse"></span> Online</p>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="text-center py-4 mb-4">
            <span className="text-[8px] bg-gray-100 text-gray-400 px-3 py-1.5 rounded-full font-black uppercase tracking-widest">Chat Aman & Terenkripsi</span>
          </div>
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.senderId === user.uid ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] p-4 rounded-3xl text-sm font-bold leading-relaxed shadow-sm ${m.senderId === user.uid ? 'bg-[#4CAF50] text-white rounded-tr-none' : 'bg-white text-[#5D4037] rounded-tl-none border border-gray-100'}`}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={scrollRef}></div>
        </div>
        
        <form onSubmit={sendMessage} className="p-4 bg-white border-t border-gray-100 flex gap-3 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-20">
          <input placeholder="Ketik pesan..." className="flex-1 bg-gray-50 p-4 rounded-2xl text-sm font-bold text-[#5D4037] outline-none border border-transparent focus:border-[#4CAF50] transition-all" value={newMessage} onChange={e=>setNewMessage(e.target.value)} />
          <button type="submit" className="bg-[#5D4037] text-white p-4 rounded-2xl shadow-lg active:scale-90 transition-transform"><Send size={20}/></button>
        </form>
      </div>
    );
  };

  const ProfileTab = () => {
    const [editData, setEditData] = useState({ 
       name: userProfile?.name || '', 
       phone: userProfile?.phone || '', 
       address: userProfile?.address || '',
       mapLink: userProfile?.mapLink || ''
    });

    const handleSave = async () => {
      if (!editData.name || !editData.phone || !editData.address) {
         showToast('Nama, Telepon, dan Alamat wajib diisi!');
         return;
      }
      await updateDoc(doc(db, "users", user.uid), editData);
      showToast('Profil pakan berhasil diperbarui!');
    };

    return (
      <div className="p-6 h-full bg-[#F8FAFC] overflow-y-auto pb-32">
        <div className="flex flex-col items-center mb-8 mt-4">
           <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center text-gray-300 shadow-xl mb-4 text-4xl shadow-gray-200 border border-gray-100">👤</div>
           <h2 className="text-2xl font-black text-[#5D4037]">{userProfile?.name}</h2>
           <span className="text-[10px] font-black bg-white text-[#4CAF50] px-4 py-2 rounded-xl uppercase tracking-[0.2em] mt-3 border border-gray-100 shadow-sm">{userProfile?.role}</span>
        </div>

        <div className="space-y-4 bg-white p-7 rounded-[32px] shadow-sm border border-gray-100 mb-6">
           <div className="flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-[#4CAF50]" />
              <h3 className="font-black text-sm text-[#5D4037] uppercase tracking-widest">Pengaturan Alamat</h3>
           </div>
           
           <div className="space-y-4">
             <div>
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Nama Penerima/Toko *</label>
               <input className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold border border-transparent focus:border-[#4CAF50] outline-none transition-all text-[#5D4037]" value={editData.name} onChange={e=>setEditData({...editData, name:e.target.value})} placeholder="Nama Lengkap" />
             </div>
             <div>
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Nomor WhatsApp *</label>
               <input className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold border border-transparent focus:border-[#4CAF50] outline-none transition-all text-[#5D4037]" value={editData.phone} onChange={e=>setEditData({...editData, phone:e.target.value})} placeholder="Cth: 08123456789" />
             </div>
             <div>
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Alamat Lengkap *</label>
               <textarea className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold border border-transparent focus:border-[#4CAF50] outline-none transition-all text-[#5D4037]" rows="3" value={editData.address} onChange={e=>setEditData({...editData, address:e.target.value})} placeholder="Jl. Raya Desa, RT/RW, Kecamatan, Kota" />
             </div>
             <div>
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Link Google Maps (Opsional)</label>
               <input className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold border border-transparent focus:border-[#4CAF50] outline-none transition-all text-[#5D4037]" value={editData.mapLink} onChange={e=>setEditData({...editData, mapLink:e.target.value})} placeholder="https://maps.app.goo.gl/..." />
             </div>
           </div>
           
           <button onClick={handleSave} className="w-full bg-[#4CAF50] text-white py-4 rounded-2xl font-black shadow-lg shadow-green-100 active:scale-95 transition-transform uppercase tracking-widest mt-4">Simpan Profil</button>
        </div>

        <button onClick={() => signOut(auth)} className="w-full bg-white text-red-500 py-4 rounded-2xl font-black flex items-center justify-center gap-2 border border-red-100 shadow-sm active:scale-95 transition-transform text-xs uppercase tracking-widest">
          <LogOut size={16}/> Logout Akun
        </button>
        
        <div className="mt-12 text-center space-y-2">
           <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.4em] italic">Created by: M. Raihan</p>
           <p className="text-[8px] text-gray-300 font-bold uppercase tracking-widest">v2.1 Firebase Stable</p>
        </div>
      </div>
    );
  };

  // --- MAIN RENDER ---
  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#4CAF50] to-[#388E3C] text-white">
      <div className="animate-bounce flex flex-col items-center">
        <Leaf size={48} className="mb-4 drop-shadow-lg" />
        <h1 className="text-4xl font-black tracking-tighter">PAKANKU</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] mt-2 opacity-80 shadow-sm">Created by: M. Raihan</p>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-md mx-auto h-screen relative bg-white overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.1)] font-sans">
      {toast && <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-[#5D4037] text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest z-[100] shadow-2xl animate-in slide-in-from-top-4 fade-in duration-300 border border-white/10 whitespace-nowrap">{toast}</div>}

      {activeView === 'auth' && <AuthView />}
      {activeView === 'main' && activeTab === 'home' && <BuyerHome />}
      {activeView === 'main' && activeTab === 'dashboard' && <SellerDashboard />}
      {activeView === 'main' && activeTab === 'cart' && <CartView />}
      {activeView === 'main' && activeTab === 'orders' && <OrdersView />}
      {activeView === 'main' && activeTab === 'profile' && <ProfileTab />}
      {activeView === 'product' && <ProductDetail />}
      {activeView === 'checkout' && <CheckoutView />}
      {activeView === 'chat' && <ChatView />}

      {activeView === 'main' && (
        <div className="absolute bottom-0 w-full bg-white/90 backdrop-blur-xl border-t border-gray-100 flex justify-around p-4 z-40 rounded-t-[40px] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          {userProfile?.role === 'buyer' ? (
            <>
              <button onClick={()=>setActiveTab('home')} className={`p-3 rounded-2xl transition-all duration-300 flex flex-col items-center gap-1 ${activeTab==='home'?'bg-[#4CAF50] text-white shadow-lg shadow-green-200 -translate-y-2':'text-gray-400 hover:text-gray-600'}`}>
                 <Home size={20}/> <span className={`text-[8px] font-black uppercase ${activeTab==='home'?'block':'hidden'}`}>Home</span>
              </button>
              <button onClick={()=>setActiveTab('cart')} className={`p-3 rounded-2xl transition-all duration-300 flex flex-col items-center gap-1 relative ${activeTab==='cart'?'bg-[#4CAF50] text-white shadow-lg shadow-green-200 -translate-y-2':'text-gray-400 hover:text-gray-600'}`}>
                <ShoppingCart size={20}/> <span className={`text-[8px] font-black uppercase ${activeTab==='cart'?'block':'hidden'}`}>Cart</span>
                {cart.length > 0 && <span className="absolute top-0 right-0 bg-red-500 text-white text-[8px] w-4 h-4 flex items-center justify-center rounded-full font-black border-2 border-white shadow-sm">{cart.length}</span>}
              </button>
              <button onClick={()=>setActiveTab('orders')} className={`p-3 rounded-2xl transition-all duration-300 flex flex-col items-center gap-1 ${activeTab==='orders'?'bg-[#4CAF50] text-white shadow-lg shadow-green-200 -translate-y-2':'text-gray-400 hover:text-gray-600'}`}>
                 <Package size={20}/> <span className={`text-[8px] font-black uppercase ${activeTab==='orders'?'block':'hidden'}`}>Orders</span>
              </button>
              <button onClick={()=>setActiveTab('profile')} className={`p-3 rounded-2xl transition-all duration-300 flex flex-col items-center gap-1 ${activeTab==='profile'?'bg-[#4CAF50] text-white shadow-lg shadow-green-200 -translate-y-2':'text-gray-400 hover:text-gray-600'}`}>
                 <UserIcon size={20}/> <span className={`text-[8px] font-black uppercase ${activeTab==='profile'?'block':'hidden'}`}>Profile</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={()=>setActiveTab('dashboard')} className={`p-3 rounded-2xl transition-all duration-300 flex flex-col items-center gap-1 ${activeTab==='dashboard'?'bg-[#5D4037] text-white shadow-lg shadow-orange-100 -translate-y-2':'text-gray-400 hover:text-gray-600'}`}>
                 <Store size={20}/> <span className={`text-[8px] font-black uppercase ${activeTab==='dashboard'?'block':'hidden'}`}>Toko</span>
              </button>
              <button onClick={()=>setActiveTab('orders')} className={`p-3 rounded-2xl transition-all duration-300 flex flex-col items-center gap-1 ${activeTab==='orders'?'bg-[#5D4037] text-white shadow-lg shadow-orange-100 -translate-y-2':'text-gray-400 hover:text-gray-600'}`}>
                 <Package size={20}/> <span className={`text-[8px] font-black uppercase ${activeTab==='orders'?'block':'hidden'}`}>Orders</span>
              </button>
              <button onClick={()=>setActiveTab('profile')} className={`p-3 rounded-2xl transition-all duration-300 flex flex-col items-center gap-1 ${activeTab==='profile'?'bg-[#5D4037] text-white shadow-lg shadow-orange-100 -translate-y-2':'text-gray-400 hover:text-gray-600'}`}>
                 <UserIcon size={20}/> <span className={`text-[8px] font-black uppercase ${activeTab==='profile'?'block':'hidden'}`}>Profile</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
