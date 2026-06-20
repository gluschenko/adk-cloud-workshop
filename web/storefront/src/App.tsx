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
  InputBase,
  Paper,
  Stack,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';
import {
  categoriesFor,
  imageLabelFor,
  imageToneFor,
  type StoreProduct,
} from './catalog.ts';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4dd2d8' },
    secondary: { main: '#f07a3f' },
    background: { default: '#071113', paper: '#0d1b1f' },
    text: { primary: '#f3fbfb', secondary: '#9fb6bb' },
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
      sx={{ border: '1px solid #22383d', boxShadow: 'none', bgcolor: '#122429' }}
    >
      <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box
            sx={{
              flex: '0 0 54px',
              width: 54,
              height: 54,
              borderRadius: 1,
              display: 'grid',
              placeItems: 'center',
              bgcolor: '#1f3135',
              background: imageToneFor(product),
              color: '#172326',
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            {imageLabelFor(product)}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography fontWeight={900} sx={{ fontSize: 14, lineHeight: 1.25 }} noWrap>
              {product.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {product.sku} - {product.category}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
              <Typography fontWeight={900}>${product.price.toFixed(2)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {product.stock} pcs
              </Typography>
            </Stack>
          </Box>
          <Button
            variant="contained"
            size="small"
            className="add-to-cart"
            data-sku={product.sku}
            disabled={product.stock <= 0}
            sx={{ minWidth: 46 }}
          >
            Add
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
      <Box sx={{ height: '100vh', overflow: 'hidden', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" color="inherit" elevation={0} sx={{ flex: '0 0 auto', borderBottom: '1px solid #22383d', bgcolor: '#0a171a' }}>
          <Container maxWidth="xl">
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1.25 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 38, height: 38, borderRadius: 1, bgcolor: 'primary.main', boxShadow: '0 0 24px rgba(77,210,216,0.22)' }} />
                <Box>
                  <Typography fontWeight={900}>TechParts Market</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Agent-first parts workspace
                  </Typography>
                </Box>
              </Stack>
              <Badge badgeContent={<span id="cart-count">0</span>} color="secondary">
                <Button id="cart-button" variant="outlined">
                  Cart
                </Button>
              </Badge>
            </Stack>
          </Container>
        </AppBar>

        <Box
          sx={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '320px minmax(0, 1fr) 320px' },
            gap: 2,
            p: 2,
            overflow: 'hidden',
            bgcolor: 'background.default',
          }}
        >
          <Paper
            id="catalog"
            sx={{
              display: { xs: 'none', lg: 'flex' },
              minHeight: 0,
              flexDirection: 'column',
              p: 1.5,
              border: '1px solid #22383d',
              bgcolor: '#0d1b1f',
              overflow: 'hidden',
            }}
          >
            <Stack spacing={1.25} sx={{ flex: '0 0 auto' }}>
              <Box>
                <Typography variant="h3">Products</Typography>
                <Typography variant="caption" color="text.secondary">
                  {products.length} seeded SKUs
                </Typography>
              </Box>
              <InputBase
                id="catalog-search"
                placeholder="Search SKU or name"
                sx={{ width: '100%', px: 1.25, py: 0.85, bgcolor: '#071113', border: '1px solid #22383d', borderRadius: 1 }}
              />
              <Box id="category-filter" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', maxHeight: 82, overflow: 'hidden' }}>
                {productCategories.map((category, index) => (
                  <Chip
                    key={category}
                    label={category}
                    size="small"
                    data-category={category}
                    color={index === 0 ? 'primary' : 'default'}
                    variant={index === 0 ? 'filled' : 'outlined'}
                    clickable
                  />
                ))}
              </Box>
            </Stack>
            <Stack id="product-grid" spacing={1} sx={{ mt: 1.5, minHeight: 0, overflow: 'hidden' }}>
              {products.map((product) => (
                <Box key={product.sku} className="product-grid-item">
                  <ProductCard product={product} />
                </Box>
              ))}
            </Stack>
            <Paper id="empty-state" sx={{ display: 'none', p: 2, mt: 1, textAlign: 'center', border: '1px dashed #4d666b', bgcolor: '#122429' }}>
              <Typography variant="h3">No products found</Typography>
            </Paper>
          </Paper>

          <Paper
            id="assistant"
            sx={{
              minHeight: 0,
              p: { xs: 1.5, md: 2 },
              border: '1px solid #2a484f',
              boxShadow: '0 18px 70px rgba(0,0,0,0.38)',
              bgcolor: '#0d1b1f',
              overflow: 'hidden',
            }}
          >
            <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                <Box>
                  <Typography variant="h2">AI Assistant</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Main control surface for orders, inventory, pricing, and cart actions.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Chip label="Orders" size="small" />
                  <Chip label="Inventory" size="small" />
                  <Chip label="Pricing" size="small" />
                  <Chip label="Cart actions" color="primary" size="small" />
                </Stack>
              </Stack>

              <Box
                id="chat-log"
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                  p: { xs: 1.25, md: 2 },
                  bgcolor: '#081315',
                  borderRadius: 1,
                  border: '1px solid #22383d',
                }}
              >
                <Box className="chat-message assistant">
                  Hi. I can check an order, find in-stock products, compare prices, and add a SKU to your cart.
                </Box>
              </Box>

              <Box component="form" id="chat-form" sx={{ display: 'flex', gap: 1, flex: '0 0 auto' }}>
                <InputBase
                  id="chat-input"
                  placeholder="Try: customer 1042 wants a return alternative, or add SONY-WH1000XM5 to cart"
                  sx={{
                    flex: 1,
                    px: 1.75,
                    py: 1.35,
                    bgcolor: '#071113',
                    border: '1px solid #2a484f',
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

          <Paper
            id="cart-panel"
            sx={{
              display: { xs: 'none', lg: 'flex' },
              minHeight: 0,
              flexDirection: 'column',
              p: 1.5,
              border: '1px solid #22383d',
              bgcolor: '#0d1b1f',
              overflow: 'hidden',
            }}
          >
            <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="start">
              <Box>
                <Typography variant="h3">Cart</Typography>
                <Typography variant="caption" color="text.secondary">
                  localStorage
                </Typography>
              </Box>
              <Stack spacing={1} alignItems="end">
                <Typography fontWeight={900} id="cart-total">
                  $0.00
                </Typography>
                <Button id="clear-cart" variant="outlined" size="small">
                  Clear
                </Button>
              </Stack>
            </Stack>
            <Stack id="cart-items" spacing={1.25} sx={{ mt: 2, minHeight: 0, overflow: 'hidden' }}>
              <Typography color="text.secondary" className="cart-empty">
                Your cart is empty.
              </Typography>
            </Stack>
          </Paper>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
