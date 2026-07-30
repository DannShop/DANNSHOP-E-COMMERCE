// OrderStatusHistory.note adalah VARCHAR(191) di MySQL (default Prisma untuk String?
// tanpa @db.Text). Potong defensif di setiap titik tulis alih-alih melebarkan kolom,
// sesuai batasan fase ini ("tidak ada migrasi Prisma untuk fungsionalitas yang sudah ada").
// Pakai Array.from supaya tidak memotong di tengah surrogate pair UTF-16.
export function truncateNote(text: string): string {
  const chars = Array.from(text);
  return chars.length > 191 ? `${chars.slice(0, 188).join("")}...` : text;
}
