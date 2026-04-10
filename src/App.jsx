import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, ShoppingCart, User as UserIcon, Search, 
  ChevronLeft, Plus, Minus, Trash2, Package, 
  MapPin, Store, Leaf, LogOut, Edit2, Check, 
  Banknote, Truck, MessageCircle, Send
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
  deleteDoc, onSnapshot, getDoc, query, where, orderBy, addDoc
} from 'firebase/firestore';

// ==========================================
// 1. FIREBASE CONFIGURATION
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
const appId = "pakanku-app"; // Base ID for Firestore paths

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
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
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
    return () => unsubscribeAuth();
  }, [activeView]);

  // ==========================================
  // 3. DATA LISTENERS (REALTIME)
  // ==========================================
  
  useEffect(() => {
    const prodRef = collection(db, 'artifacts', appId, 'public', 'data', 'products');
    const unsubProducts = onSnapshot(prodRef, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(prods);
    });
    return () => unsubProducts();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserProfile(data);
        if (activeView === 'main' && activeTab === 'home' && data.role === 'seller') {
            setActiveTab('dashboard');
        }
      }
    });

    const ordRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    const unsubOrders = onSnapshot(ordRef, (snapshot) => {
      const ords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      ords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setOrders(ords);
    });

    return () => { unsubUser(); unsubOrders(); };
  }, [user]);

  // --- CART FUNCTIONS ---
  const addToCart = (product) => {
    if (product.stock <= 0) { showToast('Stok habis!'); return; }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.qty + 1 > product.stock) { showToast('Maksimal stok!'); return prev; }
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    showToast('Masuk keranjang!');
  };

  const removeCartItem = (id) => setCart(prev => prev.filter(item => item.id !== id));
  const getCartTotal = () => cart.reduce((total, item) => total + (item.price * item.qty), 0);

  // ==========================================
  // 4. CHAT LOGIC (REALTIME)
  // ==========================================
  const openChatWithSeller = async (sellerId, sellerName) => {
    if (!user) { navigateTo('auth'); return; }
    const chatId = user.uid < sellerId ? `${user.uid}_${sellerId}` : `${sellerId}_${user.uid}`;
    
    const chatRef = doc(db, 'artifacts', appId, 'public', 'data', 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    
    if (!chatSnap.exists()) {
      await setDoc(chatRef, {
        id: chatId,
        participants: [user.uid, sellerId],
        participantNames: { [user.uid]: userProfile.name, [sellerId]: sellerName },
        lastMessage: 'Halo, saya tertarik dengan produk Anda.',
        updatedAt: new Date().toISOString()
      });
    }
    
    setActiveChat({ id: chatId, partnerName: sellerName });
    navigateTo('chat');
  };

  // --- VIEWS ---

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
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', res.user.uid), {
            id: res.user.uid,
            name: formData.name,
            role: formData.role,
            email: formData.email,
            address: '',
            phone: ''
          });
        }
      } catch (err) { setError(err.message); }
    };

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#4CAF50] p-6 relative">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm flex flex-col items-center">
          <h1 className="text-4xl font-black text-[#4CAF50] text-center italic tracking-tighter">Pakanku</h1>
          <p className="text-center text-[#8D6E63] text-[10px] font-black uppercase tracking-[0.3em] mt-1 mb-8">Created by : M. Raihan</p>
          
          {error && <p className="bg-red-50 text-red-500 p-3 rounded-xl text-xs mb-4 text-center font-bold w-full">{error}</p>}
          
          <form onSubmit={handleSubmit} className="space-y-4 w-full">
            {!isLogin && (
              <input placeholder="Nama / Toko" required className="w-full p-3 rounded-xl border border-gray-200" 
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            )}
            <input type="email" placeholder="Email" required className="w-full p-3 rounded-xl border border-gray-200"
              value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            <input type="password" placeholder="Password" required className="w-full p-3 rounded-xl border border-gray-200"
              value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
            
            {!isLogin && (
              <div className="flex gap-2">
                <button type="button" onClick={()=>setFormData({...formData, role:'buyer'})} className={`flex-1 p-2 rounded-lg text-xs font-bold border ${formData.role==='buyer'?'bg-[#4CAF50] text-white':'bg-gray-100 text-gray-500'}`}>Pembeli</button>
                <button type="button" onClick={()=>setFormData({...formData, role:'seller'})} className={`flex-1 p-2 rounded-lg text-xs font-bold border ${formData.role==='seller'?'bg-[#8D6E63] text-white':'bg-gray-100 text-gray-500'}`}>Penjual</button>
              </div>
            )}
            
            <button className="w-full bg-[#4CAF50] text-white py-3 rounded-xl font-bold shadow-lg mt-4 transition-transform active:scale-95">
              {isLogin ? 'Masuk' : 'Daftar'}
            </button>
          </form>
          
          <button onClick={() => setIsLogin(!isLogin)} className="w-full text-center text-sm mt-6 text-[#4CAF50] font-bold">
            {isLogin ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
          </button>
        </div>
        <div className="absolute bottom-10 flex flex-col items-center opacity-40">
           <Leaf className="text-white mb-2" size={20} />
           <p className="text-white text-[8px] font-bold tracking-[0.4em] uppercase">Trusted Agriculture Platform</p>
        </div>
      </div>
    );
  };

  const BuyerHome = () => (
    <div className="flex flex-col h-full bg-[#F5F5F5] pb-20">
      <div className="bg-[#4CAF50] p-4 sticky top-0 z-20 shadow-md flex items-center justify-between">
        <h2 className="text-white font-black text-xl italic tracking-tighter">PAKANKU</h2>
        <div className="flex-1 max-w-[200px] bg-white/20 rounded-full px-3 py-1.5 flex items-center gap-2">
          <Search size={16} className="text-white" />
          <input placeholder="Cari pakan..." className="bg-transparent text-xs text-white placeholder-white/70 outline-none w-full" />
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 gap-4 overflow-y-auto">
        <div className="bg-gradient-to-br from-[#8D6E63] to-[#5D4037] p-6 rounded-3xl text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="font-bold text-lg leading-tight">Pakan Berkualitas,<br/>Ternak Sehat Walafiat!</h3>
            <p className="text-[10px] opacity-80 mt-2 font-bold tracking-widest uppercase italic">Created by : M. Raihan</p>
          </div>
          <div className="absolute -bottom-4 -right-4 opacity-10 rotate-12"><Package size={100} /></div>
        </div>

        <h3 className="font-bold text-[#5D4037] flex items-center gap-2 mt-2 px-1">
          <div className="w-1.5 h-4 bg-[#4CAF50] rounded-full"></div> Produk Tersedia
        </h3>

        {products.length === 0 ? (
          <p className="text-center text-gray-400 py-10 font-medium italic">Belum ada produk...</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map(p => (
              <div key={p.id} onClick={() => { setSelectedProduct(p); navigateTo('product'); }} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between transition-transform active:scale-95">
                <div>
                   <div className="bg-gray-50 rounded-xl p-3 mb-2 flex items-center justify-center aspect-square text-3xl opacity-40">📦</div>
                   <h4 className="font-bold text-[#5D4037] text-sm line-clamp-2 leading-tight h-10">{p.name}</h4>
                   <p className="text-[#4CAF50] font-black text-base mt-1">{formatRp(p.price)}</p>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] font-bold text-gray-400 px-2 py-0.5 bg-gray-50 rounded-md">Stok: {p.stock}</span>
                  <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} className="bg-[#4CAF50] text-white p-1.5 rounded-lg shadow-sm active:scale-90">
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
    return (
      <div className="flex flex-col h-screen bg-white">
        <div className="p-4 flex items-center justify-between sticky top-0 bg-white z-20 border-b border-gray-50">
          <button onClick={() => navigateTo('main', 'home')} className="bg-gray-100 p-2 rounded-full"><ChevronLeft /></button>
          <h2 className="font-bold text-[#5D4037]">Detail Produk</h2>
          <div className="w-10"></div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-gray-50 rounded-3xl w-full aspect-square flex items-center justify-center text-6xl opacity-20 mb-6 shadow-inner">📦</div>
          <h1 className="text-2xl font-black text-[#5D4037] leading-tight mb-2">{selectedProduct.name}</h1>
          <p className="text-2xl font-black text-[#4CAF50] mb-6">{formatRp(selectedProduct.price)}</p>
          
          <div className="bg-[#FFF8E1] p-4 rounded-2xl mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-[#8D6E63] text-white p-2 rounded-xl"><Store size={20}/></div>
              <div>
                <p className="text-[10px] font-bold text-[#8D6E63] uppercase tracking-widest">Penjual</p>
                <p className="font-bold text-[#5D4037]">{selectedProduct.sellerName}</p>
              </div>
            </div>
            <button onClick={() => openChatWithSeller(selectedProduct.sellerId, selectedProduct.sellerName)} className="bg-white text-[#8D6E63] p-2 rounded-xl shadow-sm border border-[#8D6E63]/20">
              <MessageCircle size={20} />
            </button>
          </div>

          <h3 className="font-bold text-[#5D4037] mb-2">Deskripsi Pakan</h3>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">{selectedProduct.desc}</p>
          <div className="flex items-center gap-2 text-sm font-bold text-[#8D6E63]">
            <Package size={16} />
            <span>Sisa Stok: {selectedProduct.stock} karung</span>
          </div>
        </div>

        <div className="p-4 bg-white border-t border-gray-100 flex gap-3">
          <button onClick={() => addToCart(selectedProduct)} className="flex-1 py-4 rounded-2xl font-bold bg-[#4CAF50]/10 text-[#4CAF50] flex items-center justify-center gap-2">
            <ShoppingCart size={20}/> Keranjang
          </button>
          <button onClick={() => { addToCart(selectedProduct); navigateTo('main', 'cart'); }} className="flex-1 py-4 rounded-2xl font-bold bg-[#4CAF50] text-white shadow-lg">Beli Sekarang</button>
        </div>
      </div>
    );
  };

  const CartView = () => (
    <div className="flex flex-col h-full bg-[#F5F5F5] pb-20">
      <div className="bg-[#4CAF50] p-4 text-white text-center font-bold text-lg shadow-sm">Keranjang Belanja</div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 italic font-bold">Keranjang Kosong</div>
        ) : cart.map(item => (
          <div key={item.id} className="bg-white p-4 rounded-2xl flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center text-xl opacity-30">📦</div>
            <div className="flex-1">
              <h4 className="font-bold text-sm text-[#5D4037] line-clamp-1">{item.name}</h4>
              <p className="text-[#4CAF50] font-bold text-xs">{formatRp(item.price)}</p>
            </div>
            <div className="flex items-center gap-3 bg-gray-100 rounded-lg p-1">
              <button onClick={() => removeCartItem(item.id)} className="text-red-400 p-1 hover:scale-110 active:scale-90"><Trash2 size={16}/></button>
              <span className="font-bold text-xs w-4 text-center">{item.qty}</span>
            </div>
          </div>
        ))}
      </div>
      {cart.length > 0 && (
        <div className="p-4 bg-white border-t border-gray-100 fixed bottom-16 w-full max-w-md flex items-center justify-between rounded-t-3xl shadow-2xl">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Bayar</p>
            <p className="text-xl font-black text-[#4CAF50]">{formatRp(getCartTotal())}</p>
          </div>
          <button onClick={() => navigateTo('checkout')} className="bg-[#4CAF50] text-white px-8 py-3 rounded-2xl font-bold shadow-md active:scale-95">Checkout</button>
        </div>
      )}
    </div>
  );

  const CheckoutView = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    
    const handleConfirmCheckout = async () => {
      if (!userProfile?.address || !userProfile?.phone) {
        showToast('Lengkapi profil alamat & telepon dulu!');
        navigateTo('main', 'profile');
        return;
      }
      setIsProcessing(true);
      try {
        const orderId = `ORD-${Date.now()}`;
        for (const item of cart) {
          const prodRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', item.id);
          await updateDoc(prodRef, {
            stock: item.stock - item.qty,
            sold: (item.sold || 0) + item.qty
          });
        }
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', orderId), {
          id: orderId,
          buyerId: user.uid,
          buyerName: userProfile.name,
          address: userProfile.address,
          phone: userProfile.phone,
          items: cart,
          total: getCartTotal(),
          status: 'Menunggu',
          createdAt: new Date().toISOString(),
          sellerIds: [...new Set(cart.map(c => c.sellerId))]
        });
        setCart([]);
        showToast('Pesanan berhasil dibuat!');
        navigateTo('main', 'orders');
      } catch (e) { showToast('Error: ' + e.message); }
      setIsProcessing(false);
    };

    return (
      <div className="flex flex-col h-screen bg-gray-50">
        <div className="p-4 flex items-center gap-3 bg-white border-b">
          <button onClick={() => navigateTo('main', 'cart')} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft/></button>
          <h2 className="font-bold">Konfirmasi Pesanan</h2>
        </div>
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-3 flex items-center gap-2 text-[#4CAF50]"><MapPin size={18}/> Alamat Pengiriman</h3>
            <p className="text-sm font-black text-[#5D4037]">{userProfile?.name}</p>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{userProfile?.address || 'Alamat belum diatur'}</p>
            <p className="text-sm text-gray-400 mt-2 font-bold">{userProfile?.phone || 'Telepon belum diatur'}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-3 flex items-center gap-2 text-[#4CAF50]"><ShoppingCart size={18}/> Ringkasan Pakan</h3>
            {cart.map(item => (
              <div key={item.id} className="flex justify-between text-sm mb-2 border-b border-dashed border-gray-100 pb-2">
                <span className="text-gray-600">{item.qty}x {item.name}</span>
                <span className="font-bold text-[#5D4037]">{formatRp(item.price * item.qty)}</span>
              </div>
            ))}
            <div className="flex justify-between font-black text-[#4CAF50] pt-2 text-lg">
              <span>Total Bayar</span>
              <span>{formatRp(getCartTotal())}</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-3 flex items-center gap-2 text-[#4CAF50]"><Banknote size={18}/> Metode Pembayaran</h3>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
               <Truck className="text-[#4CAF50]" size={20} />
               <p className="text-[10px] font-black text-[#4CAF50] uppercase tracking-widest">Bayar di Tempat (COD) Aktif</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-white border-t border-gray-50">
          <button disabled={isProcessing} onClick={handleConfirmCheckout} className="w-full bg-[#4CAF50] text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50 active:scale-[0.98] transition-transform">
            {isProcessing ? 'Memproses Pesanan...' : 'Buat Pesanan Sekarang'}
          </button>
        </div>
      </div>
    );
  };

  const OrdersView = () => {
    const isSeller = userProfile?.role === 'seller';
    const myOrders = isSeller 
      ? orders.filter(o => o.sellerIds?.includes(user.uid))
      : orders.filter(o => o.buyerId === user.uid);

    return (
      <div className="flex flex-col h-full bg-[#F5F5F5] pb-20">
        <div className="bg-[#4CAF50] p-4 text-white text-center font-bold shadow-sm">{isSeller ? 'Pesanan Masuk' : 'Riwayat Belanja'}</div>
        <div className="p-4 space-y-4 overflow-y-auto">
          {myOrders.length === 0 ? <p className="text-center italic opacity-30 mt-10">Belum ada pesanan</p> : 
           myOrders.map(o => (
             <div key={o.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
               <div className="flex justify-between border-b border-gray-50 pb-3 mb-3">
                 <span className="text-[10px] font-black text-gray-300 uppercase tracking-tighter">ID: {o.id}</span>
                 <span className="text-[10px] font-black bg-green-50 text-green-600 px-3 py-1 rounded-full uppercase tracking-widest border border-green-100">{o.status}</span>
               </div>
               {o.items.map((item, idx) => (
                 <p key={idx} className="text-sm font-bold text-[#5D4037] flex items-center gap-2">
                   <span className="w-5 h-5 bg-gray-50 rounded text-[10px] flex items-center justify-center border border-gray-100">{item.qty}x</span>
                   {item.name}
                 </p>
               ))}
               <div className="flex justify-between items-end mt-4 pt-3 border-t border-gray-50">
                 <div>
                   <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest">Total Pembayaran</p>
                   <p className="font-black text-[#4CAF50] text-base">{formatRp(o.total)}</p>
                 </div>
                 {isSeller && (
                   <button className="text-[10px] font-black bg-[#8D6E63] text-white px-4 py-2 rounded-xl shadow-sm active:scale-95 transition-transform uppercase tracking-widest">Proses</button>
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
        const prodRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'products'));
        await setDoc(prodRef, {
          id: prodRef.id,
          name: form.name,
          price: Number(form.price),
          stock: Number(form.stock),
          desc: form.desc,
          sellerId: user.uid,
          sellerName: userProfile.name,
          sold: 0
        });
        setIsAdding(false);
        setForm({ name: '', price: '', stock: '', desc: '' });
        showToast('Produk pakan berhasil ditambahkan!');
      } catch (e) { showToast(e.message); }
    };

    if (isAdding) return (
      <div className="p-6 bg-[#FFF8E1] h-full overflow-y-auto pb-24">
        <button onClick={()=>setIsAdding(false)} className="bg-white p-2 rounded-full mb-6 shadow-sm"><ChevronLeft/></button>
        <h2 className="text-2xl font-black text-[#5D4037] mb-6">Tambah Pakan Baru</h2>
        <form onSubmit={saveProduct} className="space-y-4 bg-white p-6 rounded-3xl shadow-sm border border-orange-100">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nama Pakan</label>
            <input placeholder="Contoh: Pakan Ayam Grower" required className="w-full p-4 rounded-2xl bg-gray-50 border border-transparent focus:border-[#4CAF50] outline-none" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Harga (Rp)</label>
              <input type="number" placeholder="50000" required className="w-full p-4 rounded-2xl bg-gray-50 border border-transparent focus:border-[#4CAF50] outline-none" value={form.price} onChange={e=>setForm({...form, price:e.target.value})} />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Stok Karung</label>
              <input type="number" placeholder="10" required className="w-full p-4 rounded-2xl bg-gray-50 border border-transparent focus:border-[#4CAF50] outline-none" value={form.stock} onChange={e=>setForm({...form, stock:e.target.value})} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Deskripsi Pakan</label>
            <textarea placeholder="Jelaskan kandungan nutrisi dan keunggulan pakan..." required rows="4" className="w-full p-4 rounded-2xl bg-gray-50 border border-transparent focus:border-[#4CAF50] outline-none" value={form.desc} onChange={e=>setForm({...form, desc:e.target.value})} />
          </div>
          <button className="w-full bg-[#4CAF50] text-white py-4 rounded-2xl font-black shadow-lg shadow-green-200 active:scale-95 transition-transform uppercase tracking-widest">Posting Sekarang</button>
        </form>
      </div>
    );

    return (
      <div className="flex flex-col h-full bg-[#F5F5F5] pb-20">
        <div className="bg-[#8D6E63] p-4 text-white flex justify-between items-center shadow-md">
          <h2 className="font-bold uppercase tracking-widest text-sm">Kelola Toko</h2>
          <button onClick={()=>setIsAdding(true)} className="bg-white text-[#8D6E63] p-2 rounded-xl shadow-inner active:scale-90 transition-transform"><Plus size={20}/></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          {myProducts.length === 0 ? (
            <div className="py-20 flex flex-col items-center opacity-20">
               <Store size={64} />
               <p className="font-bold mt-4">Belum ada produk pakan</p>
            </div>
          ) : myProducts.map(p => (
            <div key={p.id} className="bg-white p-4 rounded-2xl flex items-center justify-between shadow-sm border border-gray-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-xl opacity-20 border border-gray-100">📦</div>
                <div>
                  <h4 className="font-bold text-sm text-[#5D4037] line-clamp-1">{p.name}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[#8D6E63] font-black text-xs">{formatRp(p.price)}</span>
                    <span className="text-[8px] font-bold text-gray-300 uppercase">|</span>
                    <span className="text-[10px] font-bold text-gray-400">Stok: {p.stock}</span>
                  </div>
                </div>
              </div>
              <button onClick={async ()=>{if(confirm('Hapus produk ini dari toko?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', p.id))}} className="text-red-200 hover:text-red-400 p-2 transition-colors"><Trash2 size={18}/></button>
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

    useEffect(() => {
      if (!activeChat) return;
      const msgRef = collection(db, 'artifacts', appId, 'public', 'data', 'chats', activeChat.id, 'messages');
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
      
      const chatRef = doc(db, 'artifacts', appId, 'public', 'data', 'chats', activeChat.id);
      const msgCol = collection(db, 'artifacts', appId, 'public', 'data', 'chats', activeChat.id, 'messages');
      
      await addDoc(msgCol, {
        senderId: user.uid,
        text: msg,
        createdAt: new Date().toISOString()
      });
      
      await updateDoc(chatRef, {
        lastMessage: msg,
        updatedAt: new Date().toISOString()
      });
    };

    return (
      <div className="flex flex-col h-screen bg-gray-50">
        <div className="p-4 flex items-center gap-3 bg-white border-b sticky top-0 z-10 shadow-sm">
          <button onClick={() => navigateTo('main', 'home')} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft/></button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#4CAF50]/10 rounded-full flex items-center justify-center text-[#4CAF50] font-black">{activeChat?.partnerName?.charAt(0)}</div>
            <div>
              <h3 className="font-bold text-sm text-[#5D4037]">{activeChat?.partnerName}</h3>
              <p className="text-[8px] text-green-500 font-black uppercase tracking-widest">Active Now</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-center py-4">
            <p className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em] mb-4">Chat Aman & Transparan</p>
          </div>
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.senderId === user.uid ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-4 rounded-3xl text-sm shadow-sm font-medium leading-relaxed ${m.senderId === user.uid ? 'bg-[#4CAF50] text-white rounded-tr-none' : 'bg-white text-[#5D4037] rounded-tl-none border border-gray-100'}`}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={scrollRef}></div>
        </div>
        <form onSubmit={sendMessage} className="p-4 bg-white border-t flex gap-3 shadow-inner">
          <input placeholder="Tulis pesan ke penjual..." className="flex-1 bg-gray-50 p-4 rounded-2xl text-sm outline-none border border-transparent focus:border-[#4CAF50] transition-all" value={newMessage} onChange={e=>setNewMessage(e.target.value)} />
          <button type="submit" className="bg-[#4CAF50] text-white p-4 rounded-2xl shadow-lg shadow-green-100 active:scale-90 transition-transform"><Send size={20}/></button>
        </form>
      </div>
    );
  };

  const ProfileTab = () => {
    const [editData, setEditData] = useState({ name: userProfile?.name || '', phone: userProfile?.phone || '', address: userProfile?.address || '' });

    const handleSave = async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid), editData);
      showToast('Profil pakan berhasil diperbarui!');
    };

    return (
      <div className="p-6 h-full bg-[#FFF8E1] overflow-y-auto pb-24">
        <div className="flex flex-col items-center mb-10 mt-6">
           <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-[#8D6E63] border-4 border-[#4CAF50] shadow-2xl mb-4 text-4xl shadow-green-100/50">👤</div>
           <h2 className="text-xl font-black text-[#5D4037]">{userProfile?.name}</h2>
           <span className="text-[10px] font-black bg-[#4CAF50]/10 text-[#4CAF50] px-4 py-1.5 rounded-full uppercase tracking-[0.2em] mt-3 border border-green-200">{userProfile?.role}</span>
        </div>

        <div className="space-y-5 bg-white p-7 rounded-[40px] shadow-sm border border-orange-50">
           <div className="space-y-2">
             <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest block ml-1">Profil Pengguna</label>
             <div className="space-y-4">
               <div>
                 <input className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold border border-transparent focus:border-[#4CAF50] outline-none transition-all" value={editData.name} onChange={e=>setEditData({...editData, name:e.target.value})} placeholder="Nama Anda" />
               </div>
               <div>
                 <input className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold border border-transparent focus:border-[#4CAF50] outline-none transition-all" value={editData.phone} onChange={e=>setEditData({...editData, phone:e.target.value})} placeholder="Nomor Telepon (WA)" />
               </div>
               <div>
                 <textarea className="w-full p-4 bg-gray-50 rounded-2xl text-sm font-bold border border-transparent focus:border-[#4CAF50] outline-none transition-all" rows="3" value={editData.address} onChange={e=>setEditData({...editData, address:e.target.value})} placeholder="Alamat Pengiriman Lengkap" />
               </div>
             </div>
           </div>
           <button onClick={handleSave} className="w-full bg-[#4CAF50] text-white py-4 rounded-2xl font-black shadow-lg shadow-green-50 active:scale-95 transition-transform uppercase tracking-widest">Update Profil</button>
        </div>

        <button onClick={() => signOut(auth)} className="w-full mt-6 bg-red-50 text-red-500 py-4 rounded-3xl font-black flex items-center justify-center gap-2 border border-red-100 active:scale-95 transition-transform text-xs uppercase tracking-widest">
          <LogOut size={16}/> Keluar Aplikasi
        </button>
        
        <div className="mt-12 text-center space-y-2">
           <p className="text-[10px] text-[#8D6E63] font-black uppercase tracking-[0.4em] italic">Created by : M. Raihan</p>
           <p className="text-[8px] text-gray-300 font-bold uppercase tracking-widest">Version 2.0 Stable Build</p>
        </div>
      </div>
    );
  };

  // --- MAIN RENDER ---
  if (isLoading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#4CAF50] text-white">
      <div className="animate-pulse flex flex-col items-center">
        <Leaf size={48} className="mb-4" />
        <h1 className="text-3xl font-black italic tracking-tighter">PAKANKU</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] mt-2 opacity-60">Created by : M. Raihan</p>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-md mx-auto h-screen relative bg-white overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.1)]">
      {toast && <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-[#5D4037] text-white px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest z-[100] shadow-2xl animate-bounce border border-white/20">{toast}</div>}

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
        <div className="absolute bottom-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 flex justify-around p-3 z-40 rounded-t-[40px] shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
          {userProfile?.role === 'buyer' ? (
            <>
              <button onClick={()=>setActiveTab('home')} className={`p-3 rounded-2xl transition-all ${activeTab==='home'?'bg-[#4CAF50] text-white shadow-lg shadow-green-100 scale-110':'text-gray-300 hover:text-gray-400'}`}><Home size={22}/></button>
              <button onClick={()=>setActiveTab('cart')} className={`p-3 rounded-2xl transition-all relative ${activeTab==='cart'?'bg-[#4CAF50] text-white shadow-lg shadow-green-100 scale-110':'text-gray-300 hover:text-gray-400'}`}>
                <ShoppingCart size={22}/>
                {cart.length > 0 && <span className="absolute top-1 right-1 bg-red-500 text-white text-[8px] w-4 h-4 flex items-center justify-center rounded-full font-black border-2 border-white">{cart.length}</span>}
              </button>
              <button onClick={()=>setActiveTab('orders')} className={`p-3 rounded-2xl transition-all ${activeTab==='orders'?'bg-[#4CAF50] text-white shadow-lg shadow-green-100 scale-110':'text-gray-300 hover:text-gray-400'}`}><Package size={22}/></button>
              <button onClick={()=>setActiveTab('profile')} className={`p-3 rounded-2xl transition-all ${activeTab==='profile'?'bg-[#4CAF50] text-white shadow-lg shadow-green-100 scale-110':'text-gray-300 hover:text-gray-400'}`}><UserIcon size={22}/></button>
            </>
          ) : (
            <>
              <button onClick={()=>setActiveTab('dashboard')} className={`p-3 rounded-2xl transition-all ${activeTab==='dashboard'?'bg-[#8D6E63] text-white shadow-lg shadow-orange-100 scale-110':'text-gray-300 hover:text-gray-400'}`}><Store size={22}/></button>
              <button onClick={()=>setActiveTab('orders')} className={`p-3 rounded-2xl transition-all ${activeTab==='orders'?'bg-[#8D6E63] text-white shadow-lg shadow-orange-100 scale-110':'text-gray-300 hover:text-gray-400'}`}><Package size={22}/></button>
              <button onClick={()=>setActiveTab('profile')} className={`p-3 rounded-2xl transition-all ${activeTab==='profile'?'bg-[#8D6E63] text-white shadow-lg shadow-orange-100 scale-110':'text-gray-300 hover:text-gray-400'}`}><UserIcon size={22}/></button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
