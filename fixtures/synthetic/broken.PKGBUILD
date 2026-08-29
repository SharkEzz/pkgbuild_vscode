pkgname=My-Bad-Pkg
pkgver=1.2-3
pkgrel=0
epoch=-1
license=('GPL3' 'Apache')
depends=('gtk4>=' 'good-pkg')
provides=('foo>=1.0')
source=("$pkgname-$pkgver.tar.gz::https://e.com/v.tar.gz"
        "fix.patch")
md5sums=('d41d8cd98f00b204e9800998ecf8427e')

build() {
  cd $srcdir/$pkgname
  make DESTDIR=$pkgdir install
  echo $startdir
}
