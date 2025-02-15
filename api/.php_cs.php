<?php
$finder = PhpCsFixer\Finder::create()
    ->exclude('bin')
    ->exclude('var')
    ->exclude('config')
    ->exclude('migrations')
    ->exclude('public')
    ->exclude('vendor')
    ->in(__DIR__)
;
return (new PhpCsFixer\Config())
    ->setRules([
        '@Symfony' => true,
        'phpdoc_summary' => false,
        'phpdoc_separation' => false,
        'blank_line_before_statement' => ['statements' => []],
        'no_superfluous_phpdoc_tags' => false,
        'trailing_comma_in_multiline' => false,
        'array_syntax' => ['syntax' => 'short'],
        'concat_space' => ['spacing' => 'one'],
        'yoda_style' => false,
        'cast_spaces' => ['space' => 'none'],
        'binary_operator_spaces' => [
            'default' => 'align',
            'operators' => [
                '=' => 'single_space',
                '=>' => 'align'
            ],
        ],
        'braces' => [
            'position_after_control_structures' => 'next',
            'position_after_functions_and_oop_constructs' => 'next',
            'allow_single_line_anonymous_class_with_empty_body' => true,
            'allow_single_line_closure' => true,
        ],
        'class_definition' => [
            'single_line' => true,
        ],
        'curly_braces_position' => [
            'control_structures_opening_brace' => 'next_line_unless_newline_at_signature_end',
            'functions_opening_brace' => 'next_line_unless_newline_at_signature_end',
            'anonymous_functions_opening_brace' => 'next_line_unless_newline_at_signature_end',
            'classes_opening_brace' => 'next_line_unless_newline_at_signature_end',
            'allow_single_line_empty_anonymous_classes' => true,
            'allow_single_line_anonymous_functions' => true,
        ],
        'control_structure_continuation_position' => [
            'position' => 'next_line',
        ],
        'no_trailing_whitespace_in_comment' => false,
        'single_line_comment_style' => false,
        'multiline_comment_opening_closing' => false,
    ])
    ->setUsingCache(true)
    ->setFinder($finder)
    ;