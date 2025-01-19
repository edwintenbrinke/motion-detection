# Use the official PHP 8.4 FPM image
FROM php:8.4-fpm

# Set the working directory in the container
WORKDIR /var/www/symfony

RUN apt-get update && apt-get install -y \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libzip-dev \
    libpq-dev \
    unzip \
    curl \
    ffmpeg \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install gd pdo pdo_mysql pdo_pgsql zip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Composer globally
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Install Symfony Process component (you can also install this via Composer later)
RUN curl -sS https://get.symfony.com/cli/installer | bash -s -- --install-dir=/usr/local/bin
RUN chmod +x /usr/local/bin/symfony

# Expose the port for the PHP-FPM server
EXPOSE 9000

# Start PHP-FPM server
CMD ["php-fpm"]
