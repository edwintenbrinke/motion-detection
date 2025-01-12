php bin/console doctrine:database:drop --force
php bin/console doctrine:database:create
php bin/console doctrine:migrations:migrate -n
php bin/console doctrine:migrations:diff
php bin/console doctrine:migrations:migrate -n
php bin/console doctrine:fixtures:load -n
php bin/console messenger:setup-transports
php bin/console c:c