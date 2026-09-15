require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'ChessTrainerSpeechRecognition'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://local'
  s.author = 'chess-trainer'
  s.source = { :git => 'https://local', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.frameworks = 'Speech', 'AVFoundation'
  s.swift_version = '5.1'
end
