import React from 'react';
import {
  AppBar,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  CssBaseline,
  Divider,
  Grid,
  InputBase,
  Paper,
  Stack,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';
import {
  brandFor,
  categoriesFor,
  deliveryFor,
  fitmentFor,
  imageLabelFor,
  imageToneFor,
  stockBadgeFor,
  type StoreProduct,
} from './catalog.ts';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#175c62' },
    secondary: { main: '#d85c27' },
    background: { default: '#f4f7f7', paper: '#ffffff' },
    text: { primary: '#172326', secondary: '#5b6b70' },
  },
  typography: {
    fontFamily: '"Roboto", "Arial", sans-serif',
    h1: { fontSize: 46, lineHeight: 1.05, fontWeight: 800 },
    h2: { fontSize: 28, fontWeight: 800 },
    h3: { fontSize: 20, fontWeight: 800 },
    button: { textTransform: 'none', fontWeight: 700 },
  },
  shape: { borderRadius: 8 },
});

function ProductCard({ product }: { product: StoreProduct }) {
  return (
    <Card
      className="product-card"
      data-sku={product.sku}
      data-category={product.category}
      data-search={`${product.sku} ${product.name} ${product.category} ${product.warehouse}`.toLowerCase()}
      sx={{ height: '100%', border: '1px solid #dce5e6', boxShadow: '0 12px 30px rgba(23,35,38,0.08)' }}
    >
      <Box sx={{ p: 1.5 }}>
        <Box
          sx={{
            position: 'relative',
            display: 'grid',
            placeItems: 'center',
            height: 164,
            borderRadius: 1,
            background: imageToneFor(product),
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              width: 112,
              height: 82,
              borderRadius: 2,
              background: '#1f3135',
              color: '#f8fafc',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 900,
              letterSpacing: 1,
              boxShadow: '0 18px 35px rgba(23,35,38,0.24)',
            }}
          >
            {imageLabelFor(product)}
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ position: 'absolute', top: 10, left: 10 }}>
            <Chip label={stockBadgeFor(product)} size="small" color="secondary" sx={{ fontWeight: 800 }} />
            <Chip label={product.category} size="small" sx={{ fontWeight: 800, bgcolor: '#fff' }} />
          </Stack>
        </Box>
      </Box>
      <CardContent sx={{ pt: 0 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="primary" fontWeight={800}>
              {brandFor(product)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {product.sku}
            </Typography>
          </Stack>
          <Typography variant="h3">{product.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {fitmentFor(product)}
          </Typography>
          <Divider />
          <Stack direction="row" justifyContent="space-between" alignItems="end">
            <Box>
              <Typography variant="h3">${product.price.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" fontWeight={800}>
                {product.stock} pcs
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {deliveryFor(product)}
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="contained"
            size="large"
            fullWidth
            className="add-to-cart"
            data-sku={product.sku}
            disabled={product.stock <= 0}
          >
            Add to cart
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function App({ products }: { products: StoreProduct[] }) {
  const productCategories = categoriesFor(products);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid #dce5e6' }}>
          <Container maxWidth="xl">
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 38, height: 38, borderRadius: 1, bgcolor: 'primary.main' }} />
                <Box>
                  <Typography fontWeight={900}>TechParts Market</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Products, availability, pricing, and orchestrator support
                  </Typography>
                </Box>
              </Stack>
              <Badge badgeContent={<span id="cart-count">0</span>} color="secondary">
                <Button id="cart-button" variant="outlined" href="#cart-panel">
                  Cart
                </Button>
              </Badge>
            </Stack>
          </Container>
        </AppBar>

        <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
          <Box
            sx={{
              minHeight: { md: 'calc(100vh - 122px)' },
              display: 'grid',
              alignItems: 'center',
            }}
          >
            <Grid container spacing={3} alignItems="stretch" justifyContent="center">
              <Grid size={{ xs: 12, lg: 9 }}>
                <Stack spacing={2.5} sx={{ textAlign: 'center', mb: 2.5, alignItems: 'center' }}>
                  <Chip label="AI orchestrator workspace" color="secondary" sx={{ width: 'fit-content', fontWeight: 900 }} />
                  <Typography variant="h1" sx={{ maxWidth: 900 }}>
                    Start with the assistant
                  </Typography>
                  <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 760 }}>
                    Ask it to check orders, search inventory, compare pricing, and add known SKUs to the browser cart.
                    The catalog and cart are support surfaces below.
                  </Typography>
                </Stack>

                <Paper
                  id="assistant"
                  sx={{
                    minHeight: { xs: 560, md: 650 },
                    p: { xs: 2, md: 3 },
                    border: '1px solid #c8d6d8',
                    boxShadow: '0 28px 80px rgba(23,35,38,0.18)',
                    bgcolor: '#ffffff',
                  }}
                >
                  <Stack spacing={2.5} sx={{ height: '100%' }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                      <Box sx={{ textAlign: { xs: 'left', md: 'left' } }}>
                        <Typography variant="h2">AI Assistant</Typography>
                        <Typography variant="body1" color="text.secondary">
                          The main control surface for the TechParts agents and cart.
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                        <Chip label="Orders" />
                        <Chip label="Inventory" />
                        <Chip label="Pricing" />
                        <Chip label="Cart actions" color="primary" />
                      </Stack>
                    </Stack>

                    <Box
                      id="chat-log"
                      sx={{
                        flex: 1,
                        minHeight: { xs: 300, md: 410 },
                        maxHeight: { xs: 430, md: 520 },
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.25,
                        p: { xs: 1.25, md: 2 },
                        bgcolor: '#f4f7f7',
                        borderRadius: 1,
                        border: '1px solid #dce5e6',
                      }}
                    >
                      <Box className="chat-message assistant">
                        Hi. I can check an order, find in-stock products, compare prices, and add a SKU to your cart.
                      </Box>
                    </Box>

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                      <Button variant="outlined" href="#catalog">
                        Browse product data
                      </Button>
                      <Button variant="outlined" href="#cart-panel">
                        Review local cart
                      </Button>
                    </Stack>

                    <Box component="form" id="chat-form" sx={{ display: 'flex', gap: 1 }}>
                      <InputBase
                        id="chat-input"
                        placeholder="Try: customer 1042 wants a return alternative, or add SONY-WH1000XM5 to cart"
                        sx={{
                          flex: 1,
                          px: 1.75,
                          py: 1.35,
                          bgcolor: '#fff',
                          border: '1px solid #b7c8ca',
                          borderRadius: 1,
                          fontSize: 16,
                        }}
                      />
                      <Button type="submit" variant="contained" size="large">
                        Send
                      </Button>
                    </Box>
                  </Stack>
                </Paper>
              </Grid>

              <Grid size={{ xs: 12, lg: 3 }}>
                <Stack spacing={2} sx={{ height: '100%', justifyContent: 'center' }}>
                  <Paper sx={{ p: 2.5, border: '1px solid #dce5e6', bgcolor: '#f9fbfb' }}>
                    <Typography variant="h3">{products.length}</Typography>
                    <Typography color="text.secondary">seeded products available for the assistant and catalog</Typography>
                  </Paper>
                  <Paper sx={{ p: 2.5, border: '1px solid #dce5e6', bgcolor: '#f9fbfb' }}>
                    <Typography variant="h3">A2A</Typography>
                    <Typography color="text.secondary">orchestrator routes requests to inventory, orders, and pricing agents</Typography>
                  </Paper>
                  <Paper sx={{ p: 2.5, border: '1px solid #dce5e6', bgcolor: '#f9fbfb' }}>
                    <Typography variant="h3">Local</Typography>
                    <Typography color="text.secondary">cart state stays in this browser through localStorage</Typography>
                  </Paper>
                </Stack>
              </Grid>
            </Grid>
          </Box>

          <Paper id="cart-panel" sx={{ mt: 5, p: 2.5, border: '1px solid #dce5e6', bgcolor: '#fbfdfd' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
              <Box>
                <Typography variant="h2">Local Cart</Typography>
                <Typography color="text.secondary">Stored in this browser with localStorage.</Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h3" id="cart-total">
                  $0.00
                </Typography>
                <Button id="clear-cart" variant="outlined">
                  Clear cart
                </Button>
              </Stack>
            </Stack>
            <Stack id="cart-items" spacing={1.25} sx={{ mt: 2 }}>
              <Typography color="text.secondary" className="cart-empty">
                Your cart is empty.
              </Typography>
            </Stack>
          </Paper>

          <Stack id="catalog" spacing={2.5} sx={{ mt: 4, opacity: 0.92 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
              <Box>
                <Typography variant="h2">Product Catalog</Typography>
                <Typography color="text.secondary">SSR product cards loaded from the seeded SQLite database.</Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <InputBase
                  id="catalog-search"
                  placeholder="Search by SKU, name, category, or warehouse"
                  sx={{ width: { xs: '100%', sm: 360 }, px: 1.5, py: 1, bgcolor: '#fff', border: '1px solid #dce5e6', borderRadius: 1 }}
                />
                <Box id="category-filter" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {productCategories.map((category, index) => (
                    <Chip
                      key={category}
                      label={category}
                      data-category={category}
                      color={index === 0 ? 'primary' : 'default'}
                      variant={index === 0 ? 'filled' : 'outlined'}
                      clickable
                    />
                  ))}
                </Box>
              </Stack>
            </Stack>

            <Grid container spacing={2.5} id="product-grid">
              {products.map((product) => (
                <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={product.sku} className="product-grid-item">
                  <ProductCard product={product} />
                </Grid>
              ))}
            </Grid>
            <Paper id="empty-state" sx={{ display: 'none', p: 4, textAlign: 'center', border: '1px dashed #9db1b4' }}>
              <Typography variant="h3">No products found</Typography>
              <Typography color="text.secondary">Try another search term or category.</Typography>
            </Paper>
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
