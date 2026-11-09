Pod::Spec.new do |s|
  s.name = 'StorefrontObserver'
  s.version = '1.0.0'
  s.summary = 'StoreKit storefront change signal'
  s.description = 'Observes StoreKit storefront changes.'
  s.license = { :type => 'MIT' }
  s.author = 'Disposabl'
  s.homepage = 'https://expo.dev'
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/expo/expo.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
end
