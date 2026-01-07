import { getStatuses, getLabels, createStatus, createLabel, deleteLabel, getUsers, updateUserRole, deleteUser, saveWooCommerceSettings, saveEtsySettings, getSystemSettings } from "@/app/actions"

import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Trash2, Plus, ArrowLeft, Globe, Key, Lock, Save } from "lucide-react"
import Link from "next/link"
import { getColorClasses } from "@/lib/colors"
import { UserPermissionsForm } from "@/components/settings/user-permissions-form"
import { AddUserForm } from "@/components/settings/add-user-form"
import { WooDebugTool } from "@/components/settings/woo-debug-tool"
import { StatusList } from "@/components/settings/status-list"

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
    const session = await getSession()
    if (!session || session.user.role !== "admin") {
        redirect("/")
    }

    const statuses = await getStatuses()
    const labels = await getLabels()
    const users = await getUsers()
    const systemSettings = await getSystemSettings()

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/" className="p-2 hover:bg-white rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6 text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Ayarlar</h1>
                        <p className="text-gray-500">Sistem yapılandırmasını yönetin.</p>
                    </div>
                </div>

                {/* WOOCOMMERCE INTEGRATION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
                        <span className="bg-blue-600 text-white p-1 px-2 rounded text-sm">WC</span>
                        WooCommerce Entegrasyonu
                    </h2>
                    <p className="text-sm text-gray-600 mb-6">
                        Sitenizdeki siparişleri otomatik çekmek için API bilgilerini giriniz.
                        <br />
                        <span className="text-blue-600 font-medium">WooCommerce &gt; Ayarlar &gt; Gelişmiş &gt; REST API</span> yolunu izleyerek anahtar oluşturabilirsiniz.
                    </p>

                    <form action={saveWooCommerceSettings} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50/50 p-6 rounded-xl border border-blue-100">
                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Site Adresi (URL)</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                <input
                                    name="wc_url"
                                    defaultValue={systemSettings.wc_url || ''}
                                    placeholder="https://siteadresiniz.com"
                                    className="w-full pl-10 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Consumer Key (CK)</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                <input
                                    name="wc_key"
                                    type="password"
                                    defaultValue={systemSettings.wc_key || ''}
                                    placeholder="ck_xxxxxxxxxxxx"
                                    className="w-full pl-10 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Consumer Secret (CS)</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                <input
                                    name="wc_secret"
                                    type="password"
                                    defaultValue={systemSettings.wc_secret || ''}
                                    placeholder="cs_xxxxxxxxxxxx"
                                    className="w-full pl-10 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="col-span-2 flex justify-end">
                            <button className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm">
                                <Save className="w-4 h-4" />
                                Ayarları Kaydet
                            </button>
                        </div>
                    </form>
                </div>

                {/* ETSY INTEGRATION */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-orange-100">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
                        <span className="bg-orange-600 text-white p-1 px-2 rounded text-sm">ETSY</span>
                        Etsy Entegrasyonu
                    </h2>
                    <p className="text-sm text-gray-600 mb-6">
                        Etsy mağazanızdaki siparişleri çekmek için gerekli bilgileri giriniz.
                        <br />
                        <span className="text-orange-600 font-medium">Etsy Developers</span> portalından bir App oluşturup bu bilgileri alabilirsiniz.
                    </p>

                    <form action={saveEtsySettings} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-orange-50/50 p-6 rounded-xl border border-orange-100">
                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Etsy Shop ID</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                <input
                                    name="etsy_shop_id"
                                    defaultValue={systemSettings.etsy_shop_id || ''}
                                    placeholder="Örn: 12345678"
                                    className="w-full pl-10 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">Etsy Mağaza ID'niz.</p>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">API Key (Keystring)</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                <input
                                    name="etsy_api_key"
                                    type="password"
                                    defaultValue={systemSettings.etsy_api_key || ''}
                                    placeholder="x-api-key"
                                    className="w-full pl-10 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">App Keystring.</p>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Etsy Bağlantısı</label>
                            {systemSettings.etsy_access_token ? (
                                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-green-700">Bağlantı Aktif</p>
                                        <p className="text-xs text-green-600">Erişim izni başarıyla alındı.</p>
                                    </div>
                                    <Link
                                        href="/api/etsy/auth"
                                        className="px-3 py-1.5 text-xs bg-white border border-green-200 text-green-700 rounded-md hover:bg-green-50"
                                    >
                                        Yenile
                                    </Link>
                                </div>
                            ) : (
                                <Link
                                    href="/api/etsy/auth"
                                    className="flex items-center justify-center gap-2 w-full p-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
                                >
                                    <Globe className="w-4 h-4" />
                                    Etsy ile Bağlan
                                </Link>
                            )}
                            <p className="text-[10px] text-gray-500 mt-2">
                                Önce üstteki Shop ID ve API Key alanlarını doldurup <b>Kaydet</b> butonuna basınız, sonra bağlanınız.
                            </p>
                        </div>

                        <div className="col-span-2 flex justify-end">
                            <button className="bg-orange-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-orange-700 transition-colors flex items-center gap-2 shadow-sm">
                                <Save className="w-4 h-4" />
                                Etsy Ayarlarını Kaydet
                            </button>
                        </div>
                    </form>
                </div>

                {/* DEBUG TOOL */}
                <WooDebugTool />

                {/* USER MANAGEMENT SECTION (Full Width) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900">
                                <span className="bg-orange-100 text-orange-700 p-1 px-2 rounded text-sm">3</span>
                                Personel & Yetki Yönetimi
                            </h2>
                            <p className="text-sm text-gray-600 mt-1">
                                Sisteme kayıt olan kullanıcıların yetkilerini buradan yönetebilirsiniz.
                                <br />
                                <span className="text-amber-700 font-bold">* "Pending" (Bekleyen)</span> kullanıcılar onaylanana kadar sisteme giremez.
                            </p>
                        </div>
                        <div className="flex flex-col gap-4 items-end">
                            <AddUserForm />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="p-3 font-bold text-gray-900">Ad Soyad</th>
                                    <th className="p-3 font-bold text-gray-900">Kullanıcı Adı</th>
                                    <th className="p-3 font-bold text-gray-900">Kayıt Tarihi</th>
                                    <th className="p-3 font-bold text-gray-900">Yetki (Rol)</th>
                                    <th className="p-3 font-bold text-gray-900">Sütun Yetkileri</th>
                                    <th className="p-3 font-bold text-gray-900 text-right">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50 group">
                                        <td className="p-3 font-medium text-gray-900">{user.name}</td>
                                        <td className="p-3 text-gray-700 font-medium">{user.username}</td>
                                        <td className="p-3 text-gray-700">{new Date(user.createdAt).toLocaleDateString("tr-TR")}</td>
                                        <td className="p-3">
                                            <form action={async (formData) => {
                                                "use server"
                                                const newRole = formData.get("role") as string
                                                await updateUserRole(user.id, newRole)
                                            }}>
                                                <select
                                                    name="role"
                                                    defaultValue={user.role}
                                                    className={`p-1.5 rounded border text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-900 border-purple-200' :
                                                        user.role === 'staff' ? 'bg-blue-100 text-blue-900 border-blue-200' :
                                                            'bg-amber-100 text-amber-900 border-amber-200'
                                                        }`}
                                                >
                                                    <option value="pending" className="text-gray-900">Onay Bekliyor</option>
                                                    <option value="staff" className="text-gray-900">Personel</option>
                                                    <option value="admin" className="text-gray-900">Yönetici</option>
                                                </select>
                                                <button className="ml-2 text-xs bg-gray-900 text-white px-2 py-1.5 rounded hover:bg-black transition-colors opacity-100 font-medium">
                                                    Kaydet
                                                </button>
                                            </form>
                                        </td>
                                        <td className="p-3">
                                            {user.role !== 'admin' && (
                                                <UserPermissionsForm user={user} statuses={statuses} />
                                            )}
                                        </td>
                                        <td className="p-3 text-right">
                                            {user.username !== 'admin' && (
                                                <form action={async () => {
                                                    "use server"
                                                    await deleteUser(user.id)
                                                }}>
                                                    <button className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Kullanıcıyı Sil">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </form>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* STATUS MANAGEMENT */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
                            <span className="bg-blue-100 text-blue-800 p-1 px-2 rounded text-sm font-bold">1</span>
                            Durum Kolonları
                        </h2>
                        <StatusList initialStatuses={statuses} />

                        <form action={createStatus} className="p-4 bg-gray-50 rounded-lg border border-dashed">
                            <h3 className="text-sm font-bold mb-3 text-gray-900">Yeni Kolon Ekle</h3>
                            <div className="space-y-3">
                                <input name="title" placeholder="Görünen Başlık (Örn: Paketlemede)" className="w-full text-sm p-2 border rounded text-gray-900 placeholder:text-gray-400 font-medium" required />
                                <input name="id" placeholder="Teknik Kod (Örn: packing)" className="w-full text-sm p-2 border rounded text-gray-900 placeholder:text-gray-400 font-medium" required />
                                <select name="color" className="w-full text-sm p-2 border rounded text-gray-900 font-medium">
                                    <option value="bg-gray-50">Gri</option>
                                    <option value="bg-blue-50">Mavi</option>
                                    <option value="bg-green-50">Yeşil</option>
                                    <option value="bg-yellow-50">Sarı</option>
                                    <option value="bg-red-50">Kırmızı</option>
                                    <option value="bg-purple-50">Mor</option>
                                </select>
                                <button className="w-full bg-black text-white p-2 rounded text-sm font-medium hover:bg-gray-800 flex items-center justify-center gap-2">
                                    <Plus className="w-4 h-4" /> Ekle
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* LABEL MANAGEMENT */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
                            <span className="bg-purple-100 text-purple-800 p-1 px-2 rounded text-sm font-bold">2</span>
                            Sipariş Etiketleri
                        </h2>
                        <div className="flex flex-wrap gap-2 mb-6">
                            {labels.map((label) => {
                                const colors = getColorClasses(label.color)
                                return (
                                    <div key={label.id} className={`group flex items-center gap-2 px-3 py-1 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                                        <span className="text-sm font-bold uppercase text-[10px]">{label.name}</span>
                                        <form action={async () => {
                                            "use server"
                                            await deleteLabel(label.id)
                                        }}>
                                            <button className="text-gray-400 hover:text-red-500 opacity-50 hover:opacity-100 transition-opacity">
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </form>
                                    </div>
                                )
                            })}
                        </div>

                        <form action={createLabel} className="p-4 bg-gray-50 rounded-lg border border-dashed">
                            <h3 className="text-sm font-bold mb-3 text-gray-900">Yeni Etiket Ekle</h3>
                            <div className="space-y-3">
                                <input name="name" placeholder="Etiket İsmi (Örn: VIP)" className="w-full text-sm p-2 border rounded text-gray-900 placeholder:text-gray-400 font-medium" required />
                                <select name="color" className="w-full text-sm p-2 border rounded text-gray-900 font-medium">
                                    <option value="gray">Gri</option>
                                    <option value="blue">Mavi</option>
                                    <option value="green">Yeşil</option>
                                    <option value="red">Kırmızı</option>
                                    <option value="orange">Turuncu</option>
                                    <option value="purple">Mor</option>
                                    <option value="pink">Pembe</option>
                                    <option value="black">Siyah</option>
                                </select>
                                <button className="w-full bg-black text-white p-2 rounded text-sm font-medium hover:bg-gray-800 flex items-center justify-center gap-2">
                                    <Plus className="w-4 h-4" /> Ekle
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div >
        </div >
    )
}
